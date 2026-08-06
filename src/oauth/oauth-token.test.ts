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

async function readRejectionMessage(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected operation to reject");
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
      "OAuth token request failed without an HTTP response: provider network request failed",
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
      "OAuth token request failed (HTTP 302, empty body).",
    );

    expect(calls).toEqual(["https://provider.example.com/oauth/token"]);
  });

  it("names the platform cause when the transport returns no HTTP response", async () => {
    // The case that motivated this: an SSRF/egress-guard rejection and an
    // unreachable host both threw the same bare string, and the guard one fails
    // in tens of milliseconds without touching the network.
    const refused = new TypeError("fetch failed");
    (refused as { cause?: unknown }).cause = { code: "ECONNREFUSED" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(refused)),
    );

    await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).rejects.toThrow(
      "OAuth token request failed without an HTTP response: provider network request failed (ECONNREFUSED)",
    );
  });

  it("reports status without exposing an unstructured provider error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html><head><title>502 Bad Gateway</title></head>\n<body>nginx</body></html>", {
            status: 502,
            headers: { "content-type": "text/html" },
          }),
      ),
    );

    await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).rejects.toThrow(
      "OAuth token request failed (HTTP 502, unrecognized response body).",
    );
  });

  it("maps response-stream failures to a sanitized OAuth error", async () => {
    const platformMessage = "upstream read failed at secret.internal";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error(platformMessage));
              },
            }),
            { status: 502 },
          ),
      ),
    );

    const message = await readRejectionMessage(requestAuthorizationCodeToken({ ...authorizationCodeRequest }));
    expect(message).toBe("OAuth token request failed (HTTP 502, response body could not be read).");
    expect(message).not.toContain(platformMessage);
  });

  it("preserves the bounded-response size error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 502,
            headers: { "content-length": String(1024 * 1024 + 1) },
          }),
      ),
    );

    await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).rejects.toThrow(
      "OAuth token response exceeds 1048576 bytes",
    );
  });

  it("does not expose echoed authorization-code request credentials", async () => {
    const codeVerifier = "pkce-code-verifier";
    const body = `client_secret=${authorizationCodeRequest.clientSecret}&code=${authorizationCodeRequest.code}&code_verifier=${codeVerifier}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status: 400 })),
    );

    const message = await readRejectionMessage(
      requestAuthorizationCodeToken({ ...authorizationCodeRequest, extraFields: { code_verifier: codeVerifier } }),
    );
    expect(message).toBe("OAuth token request failed (HTTP 400, unrecognized response body).");
    expect(message).not.toContain(authorizationCodeRequest.clientSecret);
    expect(message).not.toContain(authorizationCodeRequest.code);
    expect(message).not.toContain(codeVerifier);
  });

  it("does not expose tokens from an unrecognized refresh error response", async () => {
    const refreshToken = "stored-refresh-token";
    const accessToken = "unexpected-access-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: accessToken, refresh_token: refreshToken }, { status: 400 })),
    );

    const message = await readRejectionMessage(requestRefreshToken({ ...authorizationCodeRequest, refreshToken }));
    expect(message).toBe("OAuth token request failed (HTTP 400, unrecognized response body).");
    expect(message).not.toContain(refreshToken);
    expect(message).not.toContain(accessToken);
  });

  it("still prefers the provider's own error message over the fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_grant", error_description: "code already redeemed" }), {
            status: 400,
          }),
      ),
    );

    await expect(requestAuthorizationCodeToken({ ...authorizationCodeRequest })).rejects.toThrow(
      "code already redeemed",
    );
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
