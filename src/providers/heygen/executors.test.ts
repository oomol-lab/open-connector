import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./executors.ts";
import {
  createHeygenApiKeyAuth,
  createHeygenOAuthAuth,
  heygenActionHandlers,
  validateHeygenCredential,
} from "./runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HeyGen authentication", () => {
  it("validates OAuth credentials against the OAuth API origin", async () => {
    const auth = createHeygenOAuthAuth("heygen-access-token", "Bearer");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api2.heygen.com/v1/user/me");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer heygen-access-token");
      expect(headers.has("x-api-key")).toBe(false);
      return Response.json({
        data: {
          email: "owner@example.com",
          username: "owner",
        },
      });
    });

    const result = await validateHeygenCredential(auth, { fetcher }, { grantedScopes: [] });

    expect(result).toMatchObject({
      profile: {
        accountId: "owner@example.com",
        displayName: "owner@example.com",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://api2.heygen.com",
        authHeaderName: "Authorization",
        validationEndpoint: "/v1/user/me",
      },
    });
  });

  it("executes OAuth actions with Bearer authentication", async () => {
    const auth = createHeygenOAuthAuth("heygen-access-token", "Bearer");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api2.heygen.com/v1/user/me");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer heygen-access-token");
      return Response.json({ data: { username: "owner" } });
    });

    const result = await heygenActionHandlers.get_current_user({}, { auth, fetcher });

    expect(result).toEqual({
      user: { username: "owner" },
      raw: { username: "owner" },
    });
  });

  it("routes OAuth asset uploads through the OAuth API origin", async () => {
    const auth = createHeygenOAuthAuth("heygen-access-token", "Bearer");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api2.heygen.com/v1/asset");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer heygen-access-token");
      expect(headers.has("x-api-key")).toBe(false);
      return Response.json({ data: { id: "asset-1", url: "https://files.heygen.com/asset-1" } });
    });

    const result = await heygenActionHandlers.upload_asset(
      { contentBase64: "YXNzZXQ=", mimeType: "image/png" },
      { auth, fetcher },
    );

    expect(result).toMatchObject({
      assetId: "asset-1",
      url: "https://files.heygen.com/asset-1",
    });
  });

  it("removes caller authorization when proxying with an API key", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBeNull();
      expect(headers.get("x-api-key")).toBe("heygen-api-key");
      return Response.json({ data: { username: "owner" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const credential: ResolvedCredential = {
      authType: "api_key",
      apiKey: "heygen-api-key",
      values: {},
      profile: { accountId: "api_key", displayName: "API Key", grantedScopes: [] },
      metadata: {},
    };
    const context: ExecutionContext = {
      getCredential: async () => credential,
    };

    const result = await proxy(
      {
        method: "GET",
        endpoint: "/v1/user/me",
        headers: { authorization: "Bearer caller-supplied-token" },
      },
      context,
    );

    expect(result.ok).toBe(true);
  });

  it("keeps API key credentials on the public API origin", () => {
    expect(createHeygenApiKeyAuth("heygen-api-key")).toEqual({
      apiBaseUrl: "https://api.heygen.com",
      headerName: "X-Api-Key",
      headerValue: "heygen-api-key",
    });
  });
});
