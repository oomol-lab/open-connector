import type { ProviderFetch } from "../provider-runtime.ts";

import { describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { credentialValidators } from "./executors.ts";
import { zoomActionHandlers } from "./runtime.ts";

const accessToken = "zoom-access-token";

const summaryRecord = {
  meeting_host_id: "KDcuGIm1QgePTO8WbOqwIQ",
  meeting_host_email: "host@example.com",
  meeting_uuid: "aDYlohsHRtCd4ii1uC2+hA==",
  meeting_id: 81234567890,
  meeting_topic: "Weekly sync",
  meeting_start_time: "2026-11-02T09:00:00Z",
  meeting_end_time: "2026-11-02T09:45:00Z",
  summary_start_time: "2026-11-02T09:01:00Z",
  summary_end_time: "2026-11-02T09:44:00Z",
  summary_created_time: "2026-11-02T09:46:00Z",
  summary_last_modified_time: "2026-11-02T10:00:00Z",
};

describe("Zoom meeting summaries", () => {
  it("records the Zoom user id, not the email, as the account id", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      expect(url.toString()).toBe("https://api.zoom.us/v2/users/me");
      return Response.json({
        id: "KDcuGIm1QgePTO8WbOqwIQ",
        email: "host@example.com",
        display_name: "Host User",
        account_id: "account-1",
      });
    });

    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken,
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { scope: "user:read:user meeting:read:list_summaries meeting:read:summary" },
      },
      { fetcher },
    );

    expect(result).toMatchObject({
      profile: { accountId: "KDcuGIm1QgePTO8WbOqwIQ", displayName: "host@example.com" },
      grantedScopes: ["user:read:user", "meeting:read:list_summaries", "meeting:read:summary"],
    });
  });

  it("reads the connected user when get_user has no userId", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      expect(url.toString()).toBe("https://api.zoom.us/v2/users/me");
      return Response.json({ id: "KDcuGIm1QgePTO8WbOqwIQ", email: "host@example.com", display_name: "Host User" });
    });

    await expect(zoomActionHandlers.get_user({}, { accessToken, fetcher })).resolves.toMatchObject({
      user: { id: "KDcuGIm1QgePTO8WbOqwIQ", email: "host@example.com", displayName: "Host User" },
    });
  });

  it("lists summaries in a window and ends on Zoom's empty page token", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      const target = new URL(url);
      expect(target.pathname).toBe("/v2/users/me/meeting_summaries");
      expect(Object.fromEntries(target.searchParams)).toEqual({
        from: "2026-11-01T00:00:00Z",
        to: "2026-11-08T00:00:00Z",
        page_size: "50",
        next_page_token: "token-1",
      });
      return Response.json({
        page_size: 50,
        next_page_token: "",
        from: "2026-11-01T00:00:00Z",
        to: "2026-11-08T00:00:00Z",
        summaries: [summaryRecord],
      });
    });

    await expect(
      zoomActionHandlers.list_user_meeting_summaries(
        { from: "2026-11-01T00:00:00Z", to: "2026-11-08T00:00:00Z", pageSize: 50, nextPageToken: "token-1" },
        { accessToken, fetcher },
      ),
    ).resolves.toEqual({
      summaries: [
        {
          meetingUuid: "aDYlohsHRtCd4ii1uC2+hA==",
          meetingId: 81234567890,
          meetingHostId: "KDcuGIm1QgePTO8WbOqwIQ",
          meetingHostEmail: "host@example.com",
          meetingTopic: "Weekly sync",
          meetingStartTime: "2026-11-02T09:00:00Z",
          meetingEndTime: "2026-11-02T09:45:00Z",
          summaryStartTime: "2026-11-02T09:01:00Z",
          summaryEndTime: "2026-11-02T09:44:00Z",
          summaryCreatedTime: "2026-11-02T09:46:00Z",
          summaryLastModifiedTime: "2026-11-02T10:00:00Z",
        },
      ],
      nextPageToken: null,
      pageSize: 50,
      from: "2026-11-01T00:00:00Z",
      to: "2026-11-08T00:00:00Z",
    });
  });

  it("answers an empty summaries array when Zoom omits it", async () => {
    const fetcher: ProviderFetch = vi.fn(async () => Response.json({ page_size: 30, next_page_token: "" }));

    await expect(zoomActionHandlers.list_user_meeting_summaries({}, { accessToken, fetcher })).resolves.toMatchObject({
      summaries: [],
      nextPageToken: null,
    });
  });

  it("refuses an expired page token as a 400 that keeps Zoom's error code", async () => {
    const fetcher: ProviderFetch = vi.fn(async () =>
      Response.json({ code: 300, message: "The next page token is invalid or expired." }, { status: 400 }),
    );

    const error = await zoomActionHandlers
      .list_user_meeting_summaries({ nextPageToken: "stale" }, { accessToken, fetcher })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error).toMatchObject({ status: 400, details: { code: 300 } });
  });

  it("reads one summary by UUID", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      expect(new URL(url).pathname).toBe("/v2/meetings/aDYlohsHRtCd4ii1uC2%2BhA%3D%3D/meeting_summary");
      return Response.json({
        ...summaryRecord,
        summary_last_modified_user_id: "KDcuGIm1QgePTO8WbOqwIQ",
        summary_last_modified_user_email: "host@example.com",
        summary_title: "Weekly sync summary",
        summary_content: "## Summary\n\nShipped the release.",
        summary_doc_url: "https://docs.zoom.us/doc/summary-1",
        summary_overview: "Shipped the release.",
        summary_details: [{ label: "Release", summary: "Shipped." }],
        next_steps: ["Write the changelog."],
        edited_summary: { summary_overview: "Edited.", summary_details: "Edited details.", next_steps: [] },
      });
    });

    await expect(
      zoomActionHandlers.get_meeting_summary({ meetingUuid: "aDYlohsHRtCd4ii1uC2+hA==" }, { accessToken, fetcher }),
    ).resolves.toMatchObject({
      available: true,
      unavailableReason: null,
      summary: {
        meetingUuid: "aDYlohsHRtCd4ii1uC2+hA==",
        meetingId: 81234567890,
        summaryTitle: "Weekly sync summary",
        summaryContent: "## Summary\n\nShipped the release.",
        summaryDocUrl: "https://docs.zoom.us/doc/summary-1",
        summaryDetails: [{ label: "Release", summary: "Shipped." }],
        nextSteps: ["Write the changelog."],
        editedSummary: { summaryOverview: "Edited.", summaryDetails: "Edited details.", nextSteps: [] },
      },
    });
  });

  it("double-encodes a UUID that contains a double slash", async () => {
    const fetcher: ProviderFetch = vi.fn(async (url) => {
      expect(url.toString()).toBe("https://api.zoom.us/v2/meetings/%252Fab%252F%252Fcd%253D%253D/meeting_summary");
      return Response.json(summaryRecord);
    });

    await zoomActionHandlers.get_meeting_summary({ meetingUuid: "/ab//cd==" }, { accessToken, fetcher });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("turns 403 code 2305 into an unavailable summary instead of an error", async () => {
    const fetcher: ProviderFetch = vi.fn(async () =>
      Response.json({ code: 2305, message: "The meeting summary can only be shared by email." }, { status: 403 }),
    );

    await expect(
      zoomActionHandlers.get_meeting_summary({ meetingUuid: "aDYlohsHRtCd4ii1uC2+hA==" }, { accessToken, fetcher }),
    ).resolves.toEqual({
      available: false,
      unavailableReason: "shared_by_email_only",
      unavailableMessage: "The meeting summary can only be shared by email.",
      summary: null,
    });
  });

  it("keeps any other 403 an authorization failure", async () => {
    const fetcher: ProviderFetch = vi.fn(async () =>
      Response.json({ code: 4711, message: "Invalid access token, does not contain scopes." }, { status: 403 }),
    );

    await expect(
      zoomActionHandlers.get_meeting_summary({ meetingUuid: "aDYlohsHRtCd4ii1uC2+hA==" }, { accessToken, fetcher }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
