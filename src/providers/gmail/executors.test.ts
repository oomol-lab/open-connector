import { describe, expect, it } from "vitest";
import { gmailActionHandlers } from "./executors.ts";

function actionContext(fetcher: typeof fetch) {
  return {
    userId: "me",
    accessToken: "gmail-token",
    fetcher,
  };
}

describe("Gmail list actions", () => {
  it("returns an empty filter list for a successful empty response", async () => {
    await expect(
      gmailActionHandlers.list_filters(
        {},
        actionContext(async () => new Response(null, { status: 200 })),
      ),
    ).resolves.toEqual({ filters: [] });
  });

  it("returns an empty forwarding-address list for a successful empty response", async () => {
    await expect(
      gmailActionHandlers.list_forwarding_addresses(
        {},
        actionContext(async () => new Response(null, { status: 200 })),
      ),
    ).resolves.toEqual({ forwardingAddresses: [] });
  });

  it("maps a malformed successful response to a provider response error", async () => {
    await expect(
      gmailActionHandlers.list_filters(
        {},
        actionContext(async () => new Response("not-json", { status: 200 })),
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "gmail filters list response must be valid JSON",
    });
  });
});
