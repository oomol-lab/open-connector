import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAuthorizationCodeToken } from "./oauth-token.ts";

const authorizationCodeRequest = {
  clientId: "client-id",
  clientSecret: "client-secret",
  code: "authorization-code",
  createError: (message: string) => new Error(message),
  redirectUri: "https://runtime.example.com/oauth/callback",
  tokenEndpointAuthMethod: "client_secret_post" as const,
  tokenUrl: "https://provider.example.com/oauth/token",
};

describe("OAuth token requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
