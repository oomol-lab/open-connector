import type { ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";
import { confluenceActionHandlers } from "./runtime.ts";
import { confluenceOAuthScopes } from "./scopes.ts";

const oauthCredential = {
  authType: "oauth2" as const,
  accessToken: "confluence-oauth-token",
  tokenType: "Bearer",
  profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
  metadata: {},
};

describe("Confluence OAuth credentials", () => {
  it("discovers the authorized cloud site and validates its v2 API", async () => {
    const requests: URL[] = [];
    const result = await credentialValidators.oauth2!(oauthCredential, {
      fetcher: async (input, init) => {
        const url = new URL(input.toString());
        requests.push(url);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer confluence-oauth-token");
        if (url.pathname === "/oauth/token/accessible-resources") {
          return Response.json([
            {
              id: "cloud-123",
              name: "Docs",
              url: "https://docs.atlassian.net",
              scopes: confluenceOAuthScopes,
              avatarUrl: "https://docs.atlassian.net/avatar.png",
            },
          ]);
        }
        expect(url.pathname).toBe("/ex/confluence/cloud-123/wiki/api/v2/spaces");
        expect(url.searchParams.get("limit")).toBe("1");
        return Response.json({ results: [{ id: "space-1" }] });
      },
    });

    expect(requests).toHaveLength(2);
    expect(result).toMatchObject({
      profile: {
        accountId: "confluence:cloud-123",
        displayName: "Docs",
        grantedScopes: confluenceOAuthScopes,
      },
      grantedScopes: confluenceOAuthScopes,
      metadata: {
        cloudId: "cloud-123",
        siteUrl: "https://docs.atlassian.net",
        baseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/api/v2",
        restApiBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/rest/api",
        validationEndpoint: "/spaces",
        validationResultCount: 1,
      },
    });
  });

  it("requires explicit selection when authorization covers multiple Confluence sites", async () => {
    await expect(
      credentialValidators.oauth2!(oauthCredential, {
        fetcher: async () =>
          Response.json([
            {
              id: "cloud-1",
              url: "https://one.atlassian.net",
              scopes: ["read:space:confluence"],
            },
            {
              id: "cloud-2",
              url: "https://two.atlassian.net",
              scopes: ["read:space:confluence"],
            },
          ]),
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("multiple sites") });
  });
});

describe("Confluence API token credentials", () => {
  it("keeps validating API tokens with Basic authentication", async () => {
    const result = await credentialValidators.apiKey!(
      {
        apiKey: "api-token",
        values: { email: "owner@example.com", siteUrl: "https://docs.atlassian.net" },
      },
      {
        fetcher: async (input, init) => {
          expect(new URL(input.toString()).pathname).toBe("/wiki/api/v2/spaces");
          expect(new Headers(init?.headers).get("authorization")).toBe(
            `Basic ${Buffer.from("owner@example.com:api-token").toString("base64")}`,
          );
          return Response.json({ results: [] });
        },
      },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "confluence:docs.atlassian.net:owner@example.com",
        displayName: "owner@example.com (docs.atlassian.net)",
      },
      metadata: {
        baseUrl: "https://docs.atlassian.net/wiki/api/v2",
        restApiBaseUrl: "https://docs.atlassian.net/wiki/rest/api",
      },
    });
  });
});

describe("Confluence action routing", () => {
  it("routes CQL search through the v1 REST endpoint with OAuth bearer auth", async () => {
    const fetcher: ProviderFetch = async (input, init) => {
      const url = new URL(input.toString());
      expect(url.pathname).toBe("/ex/confluence/cloud-123/wiki/rest/api/search");
      expect(url.searchParams.get("cql")).toBe('type = "page"');
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer confluence-oauth-token");
      return Response.json({ results: [], _links: {} });
    };

    await expect(
      confluenceActionHandlers.search_content(
        { cql: 'type = "page"' },
        {
          baseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/api/v2",
          restApiBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-123/wiki/rest/api",
          auth: { type: "oauth2", accessToken: "confluence-oauth-token", tokenType: "Bearer" },
          fetcher,
        },
      ),
    ).resolves.toEqual({ results: [], pagination: { nextCursor: null } });
  });
});
