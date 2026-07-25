import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAuthorizationCodeToken, requestRefreshToken } from "./oauth-token.ts";

const authorizationCodeRequest = {
  clientId: "client-id",
  clientSecret: "client-secret",
  code: "authorization-code",
  createError: (message: string) => new Error(message),
  redirectUri: "https://runtime.example.com/oauth/callback",
  tokenEndpointAuthMethod: "client_secret_post" as const,
  tokenUrl: "https://provider.example.com/oauth/token",
};

function stubTokenResponse(expiresIn: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
        expires_in: expiresIn,
      }),
    ),
  );
}

describe("OAuth token requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exchanges an authorization code as a form POST that never follows redirects", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new TypeError("transport failed");
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).rejects.toThrow(
      "OAuth token request failed.",
    );

    expect(fetcher).toHaveBeenCalledOnce();
    const init = fetcher.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(String(init?.body)).toContain("client_secret=client-secret");
    expect(String(init?.body)).toContain("code=authorization-code");
  });

  it("rejects a redirecting token endpoint without following it, on Workers too", async () => {
    const calls: string[] = [];
    // Mirrors the Cloudflare Workers runtime: `redirect: "error"` is not
    // implemented there and throws, so requesting it fails on Workers while
    // passing on Node. Redirects are never followed.
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.redirect === "error") {
        throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
      }
      calls.push(input instanceof Request ? input.url : String(input));
      return new Response(null, { status: 302, headers: { location: "https://attacker.example.com/token" } });
    });

    await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).rejects.toThrow(
      "OAuth token request failed.",
    );

    expect(calls).toEqual(["https://provider.example.com/oauth/token"]);
  });

  it("preserves the token-request timeout error", async () => {
    const timeout = new Error("request timed out");
    timeout.name = "TimeoutError";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(timeout)),
    );

    await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).rejects.toThrow(
      "OAuth token request timed out.",
    );
  });

  it("stores expiresAt for numeric and numeric-string expires_in values", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    for (const [expiresIn, expectedMs] of [
      [3600, 3600_000],
      ["3600", 3600_000],
      ["  3600  ", 3600_000],
      ["1.5", 1500],
    ] as const) {
      stubTokenResponse(expiresIn);

      await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).resolves.toMatchObject({
        accessToken: "access-token",
        expiresAt: new Date(now + expectedMs).toISOString(),
      });
    }
  });

  it("reports unusable expires_in lifetimes as missing instead of expired or out of range", async () => {
    // A provider that answers 0 or a negative lifetime means "no expiry known".
    // Trusting it literally would expire the credential the moment it is stored,
    // and an out-of-range lifetime would overflow `new Date(...).toISOString()`.
    for (const expiresIn of [0, "0", -3600, "-3600", 1e300, "1e20", "not-a-number", "", null, true]) {
      stubTokenResponse(expiresIn);

      await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).resolves.toMatchObject({
        accessToken: "access-token",
        expiresAt: undefined,
      });
    }
  });

  it("applies the same expires_in parsing when refreshing a token", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const refreshRequest = {
      ...authorizationCodeRequest,
      refreshToken: "stored-refresh-token",
    };

    stubTokenResponse("3600");
    await expect(requestRefreshToken(refreshRequest)).resolves.toMatchObject({
      accessToken: "access-token",
      expiresAt: new Date(now + 3600_000).toISOString(),
    });

    stubTokenResponse(0);
    await expect(requestRefreshToken(refreshRequest)).resolves.toMatchObject({
      accessToken: "access-token",
      expiresAt: undefined,
    });
  });
});
