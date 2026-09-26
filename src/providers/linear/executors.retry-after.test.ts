import type { ExecutionContext } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { executors, proxy } from "./executors.ts";

afterEach(() => vi.unstubAllGlobals());

const credentialContext: ExecutionContext = {
  getCredential: async () => ({
    authType: "oauth2",
    accessToken: "lin_oauth_secret",
    tokenType: "Bearer",
    metadata: {},
    profile: { accountId: "user-1", displayName: "Test", grantedScopes: [] },
  }),
};

describe.each(["action", "proxy"])("Linear %s rate limit details", (path) => {
  it("preserves Retry-After through the action error envelope", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { errors: [{ message: "Rate limit exceeded" }] },
        { status: 429, headers: { "Retry-After": "73" } },
      ),
    );
    const result =
      path === "action"
        ? await executors["linear.get_current_user"]!({}, credentialContext)
        : await proxy(
            { method: "POST", endpoint: "/graphql", body: { query: "{ viewer { id } }" } },
            credentialContext,
          );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "rate_limited", details: { status: 429, details: { retryAfterSeconds: 73 } } },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
