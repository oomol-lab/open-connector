import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialValidators, executors } from "./executors.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Mailchimp credentials", () => {
  it("resolves OAuth account identity and data center from metadata", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "mailchimp-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://login.mailchimp.com/oauth2/metadata");
          expect(new Headers(init?.headers).get("authorization")).toBe("OAuth mailchimp-oauth-token");
          return Response.json({
            dc: "us21",
            role: "owner",
            accountname: "Example Audience",
            user_id: 42,
            api_endpoint: "https://us21.api.mailchimp.com/3.0/",
            login: { email: "owner@example.com", login_id: 7 },
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "42", displayName: "Example Audience" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://us21.api.mailchimp.com/3.0",
        dataCenter: "us21",
        email: "owner@example.com",
        role: "owner",
      },
    });
  });

  it("keeps API key validation compatible with Basic authentication", async () => {
    const apiKey = "0123456789abcdef-us6";
    const result = await credentialValidators.apiKey!(
      { apiKey, values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://us6.api.mailchimp.com/3.0/");
          expect(new Headers(init?.headers).get("authorization")).toBe(
            `Basic ${Buffer.from(`connect:${apiKey}`).toString("base64")}`,
          );
          return Response.json({
            account_id: "account-1",
            account_name: "Example Account",
            email: "owner@example.com",
            role: "owner",
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "account-1", displayName: "Example Account" },
      metadata: { dataCenter: "us6" },
    });
  });

  it("executes OAuth actions with the stored token type and data center", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://us21.api.mailchimp.com/3.0/lists");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer mailchimp-oauth-token");
      return Response.json({ lists: [] });
    });
    vi.stubGlobal("fetch", fetch);
    const credential: ResolvedCredential = {
      authType: "oauth2",
      accessToken: "mailchimp-oauth-token",
      tokenType: "Bearer",
      profile: { accountId: "42", displayName: "Example Audience", grantedScopes: [] },
      metadata: { dataCenter: "us21" },
    };
    const context: ExecutionContext = { getCredential: async () => credential };

    const result = await executors["mailchimp.list_lists"]!({}, context);

    expect(result).toMatchObject({ ok: true, output: { lists: [] } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects an OAuth metadata endpoint that disagrees with its data center", async () => {
    await expect(
      credentialValidators.oauth2!(
        {
          authType: "oauth2",
          accessToken: "mailchimp-oauth-token",
          tokenType: "Bearer",
          profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
          metadata: {},
        },
        {
          fetcher: async () =>
            Response.json({
              dc: "us21",
              api_endpoint: "https://us22.api.mailchimp.com/3.0",
            }),
        },
      ),
    ).rejects.toThrow("unexpected API endpoint");
  });

  it("rejects an invalid OAuth metadata data center", async () => {
    await expect(
      credentialValidators.oauth2!(
        {
          authType: "oauth2",
          accessToken: "mailchimp-oauth-token",
          tokenType: "Bearer",
          profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
          metadata: {},
        },
        {
          fetcher: async () => Response.json({ dc: "us-21" }),
        },
      ),
    ).rejects.toThrow("invalid data center");
  });
});
