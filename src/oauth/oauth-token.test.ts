import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAuthorizationCodeToken } from "./oauth-token.ts";

describe("OAuth token requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("configures redirect error mode while exchanging an authorization code", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      throw new TypeError("redirect rejected");
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(
      requestAuthorizationCodeToken({
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "authorization-code",
        createError: (message) => new Error(message),
        redirectUri: "https://runtime.example.com/oauth/callback",
        tokenEndpointAuthMethod: "client_secret_post",
        tokenUrl: "https://provider.example.com/oauth/token",
      }),
    ).rejects.toThrow("OAuth token request failed.");

    expect(fetcher).toHaveBeenCalledOnce();
    const init = fetcher.mock.calls[0]?.[1];
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(String(init?.body)).toContain("client_secret=client-secret");
    expect(String(init?.body)).toContain("code=authorization-code");
  });

  it("preserves the token-request timeout error", async () => {
    const timeout = new Error("request timed out");
    timeout.name = "TimeoutError";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(timeout)),
    );

    await expect(
      requestAuthorizationCodeToken({
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "authorization-code",
        createError: (message) => new Error(message),
        redirectUri: "https://runtime.example.com/oauth/callback",
        tokenEndpointAuthMethod: "client_secret_post",
        tokenUrl: "https://provider.example.com/oauth/token",
      }),
    ).rejects.toThrow("OAuth token request timed out.");
  });
});
