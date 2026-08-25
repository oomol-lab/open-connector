import { describe, expect, it, vi } from "vitest";
import { credentialValidators, dropboxSignActionHandlers } from "./executors.ts";

describe("Dropbox Sign authentication", () => {
  it("validates OAuth credentials with Bearer authentication", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api.hellosign.com/v3/account");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer dropbox-sign-token");
      return Response.json({
        account: {
          account_id: "account-1",
          email_address: "owner@example.com",
        },
      });
    });

    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "dropbox-sign-token",
        tokenType: "Bearer",
        profile: {
          accountId: "oauth2",
          displayName: "OAuth Credential",
          grantedScopes: ["signature_request_access"],
        },
        metadata: {},
      },
      { fetcher },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "dropbox_sign:account-1",
        displayName: "owner@example.com",
      },
      grantedScopes: ["signature_request_access"],
      metadata: {
        apiBaseUrl: "https://api.hellosign.com/v3",
        accountId: "account-1",
        emailAddress: "owner@example.com",
        validationEndpoint: "/account",
      },
    });
  });

  it("executes actions with OAuth Bearer authentication", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api.hellosign.com/v3/signature_request/list?page=2");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer dropbox-sign-token");
      return Response.json({ signature_requests: [], list_info: { page: 2 } });
    });

    const result = await dropboxSignActionHandlers.list_signature_requests(
      { page: 2 },
      {
        authorization: "Bearer dropbox-sign-token",
        fetcher,
      },
    );

    expect(result).toMatchObject({
      signatureRequests: [],
      listInfo: { page: 2 },
    });
  });
});
