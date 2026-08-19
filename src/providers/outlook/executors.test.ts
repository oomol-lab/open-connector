import { describe, expect, it } from "vitest";
import { outlookJsonRequest } from "./executors.ts";

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
});
