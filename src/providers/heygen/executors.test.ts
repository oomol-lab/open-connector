import { describe, expect, it, vi } from "vitest";
import { createHeygenOAuthAuth, heygenActionHandlers, validateHeygenCredential } from "./runtime.ts";

describe("HeyGen authentication", () => {
  it("validates OAuth credentials against the OAuth API origin", async () => {
    const auth = createHeygenOAuthAuth("heygen-access-token", "Bearer");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api.heygen.com/v3/users/me");
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
        apiBaseUrl: "https://api.heygen.com",
        authHeaderName: "Authorization",
        validationEndpoint: "/v3/users/me",
      },
    });
  });

  it("executes OAuth actions with Bearer authentication", async () => {
    const auth = createHeygenOAuthAuth("heygen-access-token", "Bearer");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://api.heygen.com/v3/users/me");
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
      expect(input.toString()).toBe("https://api.heygen.com/v3/assets");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer heygen-access-token");
      expect(headers.has("x-api-key")).toBe(false);
      expect(headers.has("content-type")).toBe(false);
      const body = init?.body;
      expect(body).toBeInstanceOf(FormData);
      if (!(body instanceof FormData)) throw new Error("Expected multipart form data");
      expect(body.get("file")).toBeInstanceOf(Blob);
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
});
