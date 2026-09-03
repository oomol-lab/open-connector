import type { ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

const credential: Extract<ResolvedCredential, { authType: "oauth2" }> = {
  authType: "oauth2",
  accessToken: "jira-token",
  tokenType: "Bearer",
  profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
  metadata: {},
};

describe("Jira OAuth credential validation", () => {
  it("accepts a token without an accessible Jira site", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () => Response.json([]),
    });

    expect(result).toEqual({
      profile: { accountId: "jira", displayName: "Jira Cloud" },
      grantedScopes: [],
      metadata: {
        resourceCount: 0,
        validationEndpoint: "/oauth/token/accessible-resources",
      },
    });
  });

  it("accepts well-formed resources without Jira product scopes", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () =>
        Response.json([{ id: "cloud-123", url: "https://docs.atlassian.net", scopes: ["read:me"] }]),
    });

    expect(result).toMatchObject({
      profile: { accountId: "jira", displayName: "Jira Cloud" },
      metadata: { resourceCount: 1 },
    });
  });

  it("rejects malformed accessible-resource responses", async () => {
    await expect(
      credentialValidators.oauth2!(credential, { fetcher: async () => Response.json({}) }),
    ).rejects.toMatchObject({ status: 502, message: "jira accessible-resources response must be an array" });
  });

  it("rejects malformed accessible-resource entries", async () => {
    await expect(
      credentialValidators.oauth2!(credential, { fetcher: async () => Response.json([{}]) }),
    ).rejects.toMatchObject({ status: 502, message: "missing jira accessible resource id" });
  });
});
