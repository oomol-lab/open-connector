import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors, proxy } from "./executors.ts";

afterEach(() => vi.unstubAllGlobals());

const credentialContext: ExecutionContext = {
  getCredential: async () => ({
    authType: "oauth2",
    accessToken: "ntn_secret",
    tokenType: "Bearer",
    metadata: {},
    profile: { accountId: "bot-1", displayName: "Test", grantedScopes: [] },
  }),
};

describe.each(["action", "proxy"])("Notion %s rate limit details", (path) => {
  it("preserves Retry-After through the action error envelope", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { object: "error", code: "rate_limited", message: "Rate limited." },
        { status: 429, headers: { "Retry-After": "73" } },
      ),
    );
    const result =
      path === "action"
        ? await executors["notion.search"]!({ query: "roadmap" }, credentialContext)
        : await proxy({ method: "GET", endpoint: "/users/me" }, credentialContext);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 73 } } },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
