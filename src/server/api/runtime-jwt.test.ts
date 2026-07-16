import type { Server } from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRuntimeJwtVerifier } from "./runtime-jwt.ts";

const issuer = "https://issuer.example.com";
const audience = "https://api.example.com";
const keyId = "runtime-key";

let server: Server;
let jwksUri: string;
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;

beforeAll(async () => {
  const signingKeys = await generateKeyPair("RS256");
  const otherKeys = await generateKeyPair("RS256");
  privateKey = signingKeys.privateKey;
  otherPrivateKey = otherKeys.privateKey;
  const publicKey = await exportJWK(signingKeys.publicKey);
  server = createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(
      request.url === "/invalid"
        ? JSON.stringify({ invalid: true })
        : JSON.stringify({ keys: [{ ...publicKey, kid: keyId, alg: "RS256", use: "sig" }] }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("JWT test server did not bind to a TCP port.");
  }
  jwksUri = `http://127.0.0.1:${address.port}/jwks`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe("createRuntimeJwtVerifier", () => {
  it("stays disabled when no JWT settings are configured", () => {
    expect(createRuntimeJwtVerifier({})).toBeUndefined();
    expect(createRuntimeJwtVerifier({ jwksUri: " ", issuer: " ", audience: " " })).toBeUndefined();
  });

  it.each([
    {
      config: { issuer, audience },
      missing: "OOMOL_CONNECT_JWKS_URI",
    },
    {
      config: { jwksUri: "https://issuer.example.com/jwks", audience },
      missing: "OOMOL_CONNECT_JWT_ISSUER",
    },
    {
      config: { jwksUri: "https://issuer.example.com/jwks", issuer },
      missing: "OOMOL_CONNECT_JWT_AUDIENCE",
    },
  ])("rejects incomplete settings missing $missing", ({ config, missing }) => {
    expect(() => createRuntimeJwtVerifier(config)).toThrow(missing);
  });

  it.each(["not a URL", "file:///tmp/jwks.json", "http://idp.example.com/jwks", "http://10.0.0.1/jwks"])(
    "rejects invalid or insecure JWKS URI %s",
    (value) => {
      expect(() => createRuntimeJwtVerifier({ jwksUri: value, issuer, audience })).toThrow(
        "OOMOL_CONNECT_JWKS_URI must be a valid HTTPS URL or HTTP loopback URL.",
      );
    },
  );

  it.each([
    "https://idp.example.com/jwks",
    "http://localhost/jwks",
    "http://localhost./jwks",
    "http://127.0.0.2/jwks",
    "http://[::1]/jwks",
  ])("accepts secure or loopback JWKS URI %s", (value) => {
    expect(createRuntimeJwtVerifier({ jwksUri: value, issuer, audience })).toBeTypeOf("function");
  });

  it("accepts a signed token with the expected issuer and audience", async () => {
    const verifier = configuredVerifier();
    const token = await signToken();

    await expect(verifier(token)).resolves.toBe(true);
  });

  it("accepts an audience array containing the expected audience", async () => {
    const verifier = configuredVerifier();
    const token = await signToken({ tokenAudience: ["https://other.example.com", audience] });

    await expect(verifier(token)).resolves.toBe(true);
  });

  it.each([
    {
      name: "malformed token",
      token: async () => "not-a-jwt",
    },
    {
      name: "invalid signature",
      token: async () => await signToken({ key: otherPrivateKey }),
    },
    {
      name: "unknown key id",
      token: async () => await signToken({ kid: "unknown-key" }),
    },
    {
      name: "missing issuer",
      token: async () => await signToken({ tokenIssuer: false }),
    },
    {
      name: "wrong issuer",
      token: async () => await signToken({ tokenIssuer: "https://wrong.example.com" }),
    },
    {
      name: "missing audience",
      token: async () => await signToken({ tokenAudience: false }),
    },
    {
      name: "wrong audience",
      token: async () => await signToken({ tokenAudience: "https://wrong.example.com" }),
    },
    {
      name: "expired token",
      token: async () => await signToken({ expirationTime: "0s" }),
    },
    {
      name: "token without expiration",
      token: async () => await signToken({ expirationTime: false }),
    },
    {
      name: "token used before nbf",
      token: async () => await signToken({ notBefore: "1h" }),
    },
  ])("rejects $name", async ({ token }) => {
    await expect(configuredVerifier()(await token())).resolves.toBe(false);
  });

  it("fails closed when the JWKS response is invalid", async () => {
    const verifier = createRuntimeJwtVerifier({
      jwksUri: jwksUri.replace("/jwks", "/invalid"),
      issuer,
      audience,
    });
    if (!verifier) {
      throw new Error("JWT verifier was not configured.");
    }

    await expect(verifier(await signToken())).resolves.toBe(false);
  });
});

interface SignTokenOptions {
  key?: CryptoKey;
  kid?: string;
  tokenIssuer?: string | false;
  tokenAudience?: string | string[] | false;
  expirationTime?: string | false;
  notBefore?: string;
}

async function signToken(options: SignTokenOptions = {}): Promise<string> {
  let token = new SignJWT({ subject: "caller" }).setProtectedHeader({ alg: "RS256", kid: options.kid ?? keyId });
  if (options.tokenIssuer !== false) {
    token = token.setIssuer(options.tokenIssuer ?? issuer);
  }
  if (options.tokenAudience !== false) {
    token = token.setAudience(options.tokenAudience ?? audience);
  }
  if (options.expirationTime !== false) {
    token = token.setExpirationTime(options.expirationTime ?? "5m");
  }
  if (options.notBefore) {
    token = token.setNotBefore(options.notBefore);
  }
  return await token.sign(options.key ?? privateKey);
}

function configuredVerifier(): (token: string) => Promise<boolean> {
  const verifier = createRuntimeJwtVerifier({ jwksUri, issuer, audience });
  if (!verifier) {
    throw new Error("JWT verifier was not configured.");
  }
  return verifier;
}
