import { describe, expect, it } from "vitest";
import { createOAuth1Signature } from "./oauth1-token.ts";

describe("OAuth 1.0 signing", () => {
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
});
