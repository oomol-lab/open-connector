import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { createAppStoreConnectAuthorization } from "./jwt.ts";

const keyId = "2X9R4HXF34";
const issuerId = "57246542-96fe-1a63-e053-0824d011072a";

async function createSigningKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  return { pem: await exportPKCS8(privateKey), publicKey };
}

function readToken(header: string): string {
  expect(header.startsWith("Bearer ")).toBe(true);
  return header.slice("Bearer ".length);
}

describe("App Store Connect token signing", () => {
  it("signs a team key token with the issuer claim", async () => {
    const { pem, publicKey } = await createSigningKey();

    const header = await createAppStoreConnectAuthorization({ keyId, issuerId, privateKey: pem })();

    const { payload, protectedHeader } = await jwtVerify(readToken(header), publicKey);
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: keyId, typ: "JWT" });
    expect(payload.aud).toBe("appstoreconnect-v1");
    expect(payload.iss).toBe(issuerId);
    expect(payload.sub).toBeUndefined();
    // Apple rejects a lifetime above 20 minutes, so the signer stays well below it.
    expect((payload.exp as number) - (payload.iat as number)).toBe(600);
  });

  it("signs an individual key token with the fixed subject and no issuer", async () => {
    const { pem, publicKey } = await createSigningKey();

    const header = await createAppStoreConnectAuthorization({ keyId, privateKey: pem })();

    const { payload, protectedHeader } = await jwtVerify(readToken(header), publicKey);
    expect(protectedHeader.kid).toBe(keyId);
    expect(payload.sub).toBe("user");
    expect(payload.iss).toBeUndefined();
    expect(payload.aud).toBe("appstoreconnect-v1");
  });

  it("accepts a private key pasted with escaped line breaks", async () => {
    const { pem, publicKey } = await createSigningKey();
    const escaped = pem.replaceAll("\n", "\\n");

    const header = await createAppStoreConnectAuthorization({ keyId, issuerId, privateKey: escaped })();

    await expect(jwtVerify(readToken(header), publicKey)).resolves.toBeDefined();
  });

  it("signs once and reuses the token for the rest of the run", async () => {
    const { pem } = await createSigningKey();
    const authorization = createAppStoreConnectAuthorization({ keyId, issuerId, privateKey: pem });

    const [first, second] = await Promise.all([authorization(), authorization()]);

    expect(first).toBe(second);
  });

  it("rejects a private key that is not a PEM block", () => {
    expect(() => createAppStoreConnectAuthorization({ keyId, privateKey: "AuthKey_2X9R4HXF34" })).toThrow(
      /privateKey/u,
    );
    try {
      createAppStoreConnectAuthorization({ keyId, privateKey: "AuthKey_2X9R4HXF34" });
      expect.unreachable("a non-PEM private key must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderRequestError);
      expect((error as ProviderRequestError).status).toBe(400);
    }
  });

  it("rejects a PEM block that does not hold an EC P-256 key", async () => {
    const authorization = createAppStoreConnectAuthorization({
      keyId,
      privateKey: "-----BEGIN PRIVATE KEY-----\nbm90LWEta2V5\n-----END PRIVATE KEY-----\n",
    });

    await expect(authorization()).rejects.toMatchObject({ status: 400 });
  });
});
