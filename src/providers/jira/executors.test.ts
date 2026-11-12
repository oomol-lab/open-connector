import type { ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it, vi } from "vitest";
import { credentialValidators, jiraActionHandlers } from "./executors.ts";

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
      metadata: {
        resourceCount: 0,
        validationEndpoint: "/oauth/token/accessible-resources",
      },
    });
  });

  it("accepts well-formed resources without Jira product scopes", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () => Response.json([{ id: "cloud-123", url: "https://docs.atlassian.net", scopes: ["read:me"] }]),
    });

    expect(result).toMatchObject({
      profile: { accountId: "jira", displayName: "Jira Cloud" },
      metadata: { resourceCount: 1 },
    });
  });

  it("keeps resource scopes without inferring extra permissions", async () => {
    const result = await credentialValidators.oauth2!(credential, {
      fetcher: async () =>
        Response.json([
          {
            id: "cloud-123",
            url: "https://jira.atlassian.net",
            scopes: ["write:jira-work", "read:unknown-new-scope"],
          },
        ]),
    });
    expect(result?.grantedScopes).toEqual(["write:jira-work", "read:unknown-new-scope"]);
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

describe("Jira Data Center comments", () => {
  it("keeps the spaces between ADF text nodes in the plain-text body", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: "10001" }));

    await jiraActionHandlers.add_comment(
      {
        issueIdOrKey: "OPS-1",
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Release 2.4", marks: [{ type: "strong" }] },
                { type: "text", text: " is out." },
              ],
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "See " },
                {
                  type: "text",
                  text: "the notes",
                  marks: [{ type: "link", attrs: { href: "https://example.com/notes" } }],
                },
                { type: "text", text: "." },
              ],
            },
          ],
        },
      },
      {
        accessToken: "jira-pat",
        fetcher,
        providerMetadata: { apiBaseUrl: "https://jira.example.com/rest/api/2" },
        deployment: "server",
      },
    );

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://jira.example.com/rest/api/2/issue/OPS-1/comment");
    expect(JSON.parse(String(init?.body))).toEqual({ body: "Release 2.4 is out.\nSee the notes." });
  });
});
