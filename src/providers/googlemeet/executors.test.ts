import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, googleMeetActionHandlers, proxy } from "./executors.ts";

const accessToken = "google-meet-access-token";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Meet OAuth execution", () => {
  it("validates the credential through Google user info", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url, init) => {
      expect(url.toString()).toBe("https://www.googleapis.com/oauth2/v3/userinfo");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
      return Response.json({ sub: "google-user-1", email: "meet@example.com", name: "Meet User" });
    });

    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken,
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      { fetcher },
    );

    expect(result).toMatchObject({
      profile: { accountId: "meet@example.com", displayName: "Meet User" },
      metadata: { currentAccount: { sub: "google-user-1", email: "meet@example.com" } },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("creates a meeting space with Bearer authentication", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url, init) => {
      expect(url.toString()).toBe("https://meet.googleapis.com/v2/spaces");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
      expect(JSON.parse(String(init?.body))).toEqual({ config: { accessType: "TRUSTED" } });
      return Response.json({
        name: "spaces/space-1",
        meetingCode: "abc-mnop-xyz",
        meetingUri: "https://meet.google.com/abc-mnop-xyz",
      });
    });

    await expect(
      googleMeetActionHandlers.create_space({ space: { config: { accessType: "TRUSTED" } } }, { accessToken, fetcher }),
    ).resolves.toMatchObject({ name: "spaces/space-1", meetingCode: "abc-mnop-xyz" });
  });

  it("constructs participant list paths and pagination query values", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      const target = new URL(url);
      expect(target.origin + target.pathname).toBe(
        "https://meet.googleapis.com/v2/conferenceRecords/record-1/participants",
      );
      expect(Object.fromEntries(target.searchParams)).toEqual({
        filter: "latest_end_time IS NULL",
        pageSize: "250",
        pageToken: "next-1",
      });
      return Response.json({
        participants: [{ name: "conferenceRecords/record-1/participants/person-1" }],
        totalSize: 1,
      });
    });

    await expect(
      googleMeetActionHandlers.list_participants(
        {
          parent: "record-1",
          filter: "latest_end_time IS NULL",
          pageSize: 250,
          pageToken: "next-1",
        },
        { accessToken, fetcher },
      ),
    ).resolves.toEqual({
      participants: [{ name: "conferenceRecords/record-1/participants/person-1" }],
      nextPageToken: null,
      totalSize: 1,
    });
  });

  it("omits unsupported filters from transcript list requests", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      const target = new URL(url);
      expect(target.origin + target.pathname).toBe(
        "https://meet.googleapis.com/v2/conferenceRecords/record-1/transcripts",
      );
      expect(Object.fromEntries(target.searchParams)).toEqual({ pageSize: "10", pageToken: "next-1" });
      return Response.json({ transcripts: [], nextPageToken: "next-2" });
    });

    await expect(
      googleMeetActionHandlers.list_transcripts(
        {
          parent: "record-1",
          filter: "start_time > 2026-01-01T00:00:00Z",
          pageSize: 10,
          pageToken: "next-1",
        },
        { accessToken, fetcher },
      ),
    ).resolves.toEqual({ transcripts: [], nextPageToken: "next-2" });
  });

  it("updates a meeting space with an update mask", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url, init) => {
      const target = new URL(url);
      expect(target.origin + target.pathname).toBe("https://meet.googleapis.com/v2/spaces/space-1");
      expect(Object.fromEntries(target.searchParams)).toEqual({ updateMask: "config.accessType" });
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({
        name: "spaces/space-1",
        config: { accessType: "OPEN" },
      });
      return Response.json({ name: "spaces/space-1", config: { accessType: "OPEN" } });
    });

    await expect(
      googleMeetActionHandlers.update_space(
        {
          name: "spaces/space-1",
          space: { config: { accessType: "OPEN" } },
          updateMask: "config.accessType",
        },
        { accessToken, fetcher },
      ),
    ).resolves.toMatchObject({ name: "spaces/space-1", config: { accessType: "OPEN" } });
  });

  it("ends an active conference through the custom method", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url, init) => {
      expect(url.toString()).toBe("https://meet.googleapis.com/v2/spaces/space-1:endActiveConference");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({});
      return Response.json({});
    });

    await expect(
      googleMeetActionHandlers.end_active_conference({ name: "spaces/space-1" }, { accessToken, fetcher }),
    ).resolves.toEqual({ success: true });
  });
});

describe("Google Meet resource names", () => {
  const fetcher: ProviderFetch = async () => {
    throw new Error("invalid resource names must not be fetched");
  };
  const context = { accessToken, fetcher };

  it.each([
    ["space traversal", "get_space", { name: "spaces/.." }],
    ["bare space ID for update", "update_space", { name: "space-1" }],
    ["meeting-code alias for update", "update_space", { name: "spaces/abc-mnop-xyz" }],
    ["bare space ID for end active conference", "end_active_conference", { name: "space-1" }],
    ["meeting-code alias for end active conference", "end_active_conference", { name: "spaces/abc-mnop-xyz" }],
    ["conference record traversal", "get_conference_record", { name: "conferenceRecords/%2e%2e" }],
    ["participant traversal", "get_participant", { name: "conferenceRecords/record-1/participants/.." }],
    [
      "participant session with a missing participant",
      "get_participant_session",
      { name: "conferenceRecords/record-1/participantSessions/session-1" },
    ],
    [
      "recording with extra path segments",
      "get_recording",
      { name: "conferenceRecords/record-1/recordings/recording-1/file" },
    ],
    [
      "transcript entry traversal",
      "get_transcript_entry",
      { name: "conferenceRecords/record-1/transcripts/transcript-1/entries/%2E%2E" },
    ],
  ])("rejects %s", async (_description, action, input) => {
    await expect(googleMeetActionHandlers[action](input, context)).rejects.toMatchObject({ status: 400 });
  });
});

describe("Google Meet proxy", () => {
  const credential: ResolvedCredential = {
    authType: "oauth2",
    accessToken,
    tokenType: "Bearer",
    profile: { accountId: "meet@example.com", displayName: "Meet User", grantedScopes: [] },
    metadata: {},
  };
  const context: ExecutionContext = {
    getCredential: async () => credential,
  };

  it("routes only v2 requests with the stored OAuth credential", async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://meet.googleapis.com/v2/conferenceRecords?pageSize=1");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${accessToken}`);
      return Response.json({ conferenceRecords: [] });
    });
    vi.stubGlobal("fetch", fetch);

    const result = await proxy(
      {
        method: "GET",
        endpoint: "/v2/conferenceRecords",
        query: { pageSize: 1 },
        headers: { authorization: "Bearer caller-supplied-token" },
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, response: { status: 200, data: { conferenceRecords: [] } } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects endpoints outside the Meet v2 API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(proxy({ method: "GET", endpoint: "/oauth2/v2/userinfo" }, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    await expect(proxy({ method: "GET", endpoint: "/v2beta/conferenceRecords" }, context)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
