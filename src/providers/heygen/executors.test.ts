import { describe, expect, it, vi } from "vitest";
import {
  createHeygenApiKeyAuth,
  createHeygenOAuthAuth,
  heygenActionHandlers,
  validateHeygenCredential,
} from "./runtime.ts";

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

  it("keeps API key credentials on the public API origin", () => {
    expect(createHeygenApiKeyAuth("heygen-api-key")).toEqual({
      apiBaseUrl: "https://api.heygen.com",
      headerName: "X-Api-Key",
      headerValue: "heygen-api-key",
    });
  });
});
