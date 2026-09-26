import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction } from "../../core/execution.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { provider } from "./definition.ts";
import { executors, outlookJsonRequest } from "./executors.ts";

// The allowlist runs before any fetch, so whether the fetcher was
// called tells which side of it a URL landed on.
function recordingFetcher(calls: string[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("outlook nextLink path allowlist", () => {
  it("accepts Graph's parenthesized folder-scoped continuation URL", async () => {
    // Real wire shape, id elided.
    const calls: string[] = [];
    await outlookJsonRequest(
      "https://graph.microsoft.com/v1.0/me/mailFolders('AQMkADAwATM3ZmYtRFRM')/messages?%24select=id&%24top=2&%24skiptoken=RFRM9",
      { accessToken: "test-token", fetcher: recordingFetcher(calls) },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/v1.0/me/mailFolders('AQMkADAwATM3ZmYtRFRM')/messages");
  });

  it("accepts the unscoped messages URL and the slash-form folder URL", async () => {
    for (const url of [
      "https://graph.microsoft.com/v1.0/me/messages?%24top=2&%24skiptoken=RFRM9",
      "https://graph.microsoft.com/v1.0/me/mailFolders/AQMkADAwATM3ZmYtRFRM/messages?%24top=2",
    ]) {
      const calls: string[] = [];
      await outlookJsonRequest(url, { accessToken: "test-token", fetcher: recordingFetcher(calls) });
      expect(calls).toHaveLength(1);
    }
  });

  it("accepts the delta continuation URLs on both folder-scoped message-collection shapes", async () => {
    for (const url of [
      "https://graph.microsoft.com/v1.0/me/mailFolders('AQMkADAwATM3ZmYtRFRM')/messages/delta?%24skiptoken=RFRM9",
      "https://graph.microsoft.com/v1.0/me/mailFolders/AQMkADAwATM3ZmYtRFRM/messages/delta?%24deltatoken=RFRM9",
    ]) {
      const calls: string[] = [];
      await outlookJsonRequest(url, { accessToken: "test-token", fetcher: recordingFetcher(calls) });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("/messages/delta?");
    }
  });

  it("rejects a delta suffix on anything but a folder's message collection", async () => {
    for (const url of [
      "https://graph.microsoft.com/v1.0/me/messages/delta?%24deltatoken=RFRM9",
      "https://graph.microsoft.com/v1.0/me/contacts/delta",
      "https://graph.microsoft.com/v1.0/me/delta",
      "https://graph.microsoft.com/v1.0/me/mailFolders/delta",
      "https://graph.microsoft.com/v1.0/me/mailFolders/AQMkADAwATM3ZmYtRFRM/delta",
      "https://graph.microsoft.com/v1.0/me/mailFolders/AQMkADAwATM3ZmYtRFRM/messages/delta/delta",
      "https://graph.microsoft.com/v1.0/me/mailFolders('')/messages/delta",
    ]) {
      const calls: string[] = [];
      await expect(
        outlookJsonRequest(url, { accessToken: "test-token", fetcher: recordingFetcher(calls) }),
      ).rejects.toThrow("nextLink does not target an allowed Microsoft Graph endpoint");
      expect(calls).toHaveLength(0);
    }
  });

  it("rejects foreign hosts, non-mail Graph paths, http downgrades, and an empty parenthesized id", async () => {
    for (const url of [
      "https://evil.example.com/v1.0/me/messages",
      "https://graph.microsoft.com/v1.0/me/events",
      "http://graph.microsoft.com/v1.0/me/messages",
      "https://graph.microsoft.com/v1.0/me/mailFolders('')/messages",
    ]) {
      const calls: string[] = [];
      await expect(
        outlookJsonRequest(url, { accessToken: "test-token", fetcher: recordingFetcher(calls) }),
      ).rejects.toThrow();
      expect(calls).toHaveLength(0);
    }
  });

  it("accepts the mail-folder listing URL under the mailFolders policy", async () => {
    const calls: string[] = [];
    await outlookJsonRequest("https://graph.microsoft.com/v1.0/me/mailFolders?%24top=10&%24skiptoken=RFRM9", {
      accessToken: "test-token",
      fetcher: recordingFetcher(calls),
      absoluteUrlPolicy: "mailFolders",
    });
    expect(calls).toHaveLength(1);
  });

  it("preserves the Outlook-specific guidance for inefficient filters", async () => {
    const fetcher = (async () =>
      Response.json(
        { error: { code: "InefficientFilter", message: "The restriction is invalid." } },
        { status: 400 },
      )) as typeof fetch;

    await expect(outlookJsonRequest("me/messages", { accessToken: "test-token", fetcher })).rejects.toThrow(
      "include every orderby property in filter",
    );
  });
});

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "outlook-token",
  tokenType: "Bearer",
  profile: { accountId: "outlook-user", displayName: "Outlook User", grantedScopes: [] },
  metadata: {},
};

describe("outlook list_messages delta", () => {
  beforeEach(() => setDefaultGuardedFetchDnsLookup(null));

  afterEach(() => {
    setDefaultGuardedFetchDnsLookup(undefined);
    vi.unstubAllGlobals();
  });

  it("lists a folder through messages/delta and returns the deltaLink with raw rows", async () => {
    const deltaLink =
      "https://graph.microsoft.com/v1.0/me/mailFolders('AQMkADAwATM3ZmYtRFRM')/messages/delta?%24deltatoken=RFRM9";
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({
        value: [
          { id: "msg-1", subject: "Hello" },
          { id: "msg-2", "@removed": { reason: "deleted" } },
        ],
        "@odata.deltaLink": deltaLink,
      });
    });

    const result = await execute("list_messages", {
      mailFolderId: "AQMkADAwATM3ZmYtRFRM",
      delta: true,
      select: ["id", "subject"],
    });

    expect(result).toEqual({
      ok: true,
      output: {
        messages: [
          { id: "msg-1", subject: "Hello" },
          { id: "msg-2", "@removed": { reason: "deleted" } },
        ],
        nextLink: null,
        deltaLink,
      },
    });
    expect(request?.url).toContain("/v1.0/me/mailFolders/AQMkADAwATM3ZmYtRFRM/messages/delta?");
    expect(request?.url).toContain("%24select=id%2Csubject");
    expect(request?.headers.get("authorization")).toBe("Bearer outlook-token");
  });

  it("reports an in-round nextLink with deltaLink null until the round completes", async () => {
    const nextLink =
      "https://graph.microsoft.com/v1.0/me/mailFolders('AQMkADAwATM3ZmYtRFRM')/messages/delta?%24skiptoken=RFRM9";
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ value: [{ id: "msg-1" }], "@odata.nextLink": nextLink });
    });

    const result = await execute("list_messages", { mailFolderId: "AQMkADAwATM3ZmYtRFRM", delta: true });

    expect(result).toEqual({ ok: true, output: { messages: [{ id: "msg-1" }], nextLink, deltaLink: null } });
    expect(request?.url).toBe("https://graph.microsoft.com/v1.0/me/mailFolders/AQMkADAwATM3ZmYtRFRM/messages/delta");
  });

  it("rejects delta without a mail folder before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await execute("list_messages", { delta: true });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", message: "mailFolderId is required when delta is true." },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honours a deltaLink follow-up as the request URL, ignoring the listing query inputs", async () => {
    const deltaLink =
      "https://graph.microsoft.com/v1.0/me/mailFolders('AQMkADAwATM3ZmYtRFRM')/messages/delta?%24deltatoken=RFRM9";
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ value: [], "@odata.deltaLink": `${deltaLink}0` });
    });

    const result = await execute("list_messages", { deltaLink, top: 5, bodyContentType: "text" });

    expect(result).toEqual({ ok: true, output: { messages: [], nextLink: null, deltaLink: `${deltaLink}0` } });
    expect(request?.url).toBe(deltaLink);
    expect(request?.headers.get("prefer")).toBe('outlook.body-content-type="text"');
  });

  it("rejects a deltaLink outside the message allowlist before any fetch", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await execute("list_messages", {
      deltaLink: "https://graph.microsoft.com/v1.0/me/contacts/delta?%24deltatoken=RFRM9",
    });

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the plain listing shape, with deltaLink null", async () => {
    let request: Request | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      request = input instanceof Request ? input : new Request(input, init);
      return Response.json({ value: [{ id: "msg-1" }] });
    });

    const result = await execute("list_messages", { top: 1 });

    expect(result).toEqual({ ok: true, output: { messages: [{ id: "msg-1" }], nextLink: null, deltaLink: null } });
    expect(request?.url).toBe("https://graph.microsoft.com/v1.0/me/messages?%24top=1");
  });
});

async function execute(actionName: string, input: Record<string, unknown>) {
  const context: ExecutionContext = {
    async getCredential(service) {
      expect(service).toBe("outlook");
      return credential;
    },
  };
  return executeAction(
    provider.actions.find((action) => action.name === actionName)!,
    executors[`outlook.${actionName}`],
    input,
    context,
  );
}
