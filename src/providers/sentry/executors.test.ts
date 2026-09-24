import { describe, expect, it, vi } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Sentry OAuth credential validation", () => {
  it("resolves the token's user from the API index", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ version: "0", user: { id: "42", name: "Dev User" }, auth: { scopes: ["org:read"] } }),
    );

    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "sentry-access-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      { fetcher } as never,
    );

    expect(fetcher).toHaveBeenCalledWith("https://sentry.io/api/0/", expect.anything());
    expect(result?.profile).toMatchObject({ accountId: "42", displayName: "Dev User" });
    expect(result?.grantedScopes).toEqual(["org:read"]);
  });
});
