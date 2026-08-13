import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuth1Signature, requestOAuth1TemporaryCredential } from "./oauth1-token.ts";

describe("OAuth 1.0 signing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("matches the RFC 5849 HMAC-SHA1 signature example", async () => {
    await expect(
      createOAuth1Signature({
        method: "GET",
        url: new URL("http://photos.example.net/photos?file=vacation.jpg&size=original"),
        parameters: {
          oauth_consumer_key: "dpf43f3p2l4k3l03",
          oauth_nonce: "kllo9940pd9333jh",
          oauth_signature_method: "HMAC-SHA1",
          oauth_timestamp: "1191242096",
          oauth_token: "nnch734d00sl2jdk",
          oauth_version: "1.0",
        },
        clientSecret: "kd94hf93k423kf44",
        tokenSecret: "pfkkdhi9sl3r4s00",
      }),
    ).resolves.toBe("tR3+Ty81lMeYAr/Fid0kMTYa/WM=");
  });

  it("maps request timeouts to a stable OAuth error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        throw error;
      }),
    );

    await expect(
      requestOAuth1TemporaryCredential({
        requestTokenUrl: "https://example.com/oauth/request-token",
        callbackUrl: "https://connector.example.com/oauth/callback",
        clientId: "consumer-key",
        clientSecret: "consumer-secret",
        createError: (message) => new Error(message),
      }),
    ).rejects.toThrow("OAuth token request timed out.");
  });
});
