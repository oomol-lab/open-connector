import { importPKCS8, SignJWT } from "jose";
import { optionalString } from "../../core/cast.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

/** The audience every App Store Connect token is signed for. */
const appStoreConnectAudience = "appstoreconnect-v1";
/**
 * App Store Connect rejects a token whose `exp - iat` is more than 20 minutes.
 * Ten minutes stays well inside that ceiling while covering an action that
 * issues several requests.
 */
const tokenLifetimeSeconds = 600;
const pkcs8Marker = "-----BEGIN PRIVATE KEY-----";

interface AppStoreConnectKey {
  keyId: string;
  /** Present for a team key; an individual key has no issuer and signs with `sub: "user"`. */
  issuerId: string | undefined;
  privateKey: string;
}

/**
 * Build the `Authorization` header value for one App Store Connect action run.
 *
 * The returned function signs the ES256 JWT on first use and reuses it for the
 * rest of the run, so an action that issues several requests signs once. The
 * token is never cached across runs, which would outlive the credential it was
 * signed from.
 */
export function createAppStoreConnectAuthorization(values: Record<string, string>): () => Promise<string> {
  const key = readAppStoreConnectKey(values);
  let signed: Promise<string> | undefined;
  return () => {
    signed ??= signAuthorizationHeader(key);
    return signed;
  };
}

function readAppStoreConnectKey(values: Record<string, string>): AppStoreConnectKey {
  const privateKey = requiredInputString(values.privateKey, "privateKey").replaceAll("\\n", "\n");
  if (!privateKey.includes(pkcs8Marker)) {
    throw new ProviderRequestError(
      400,
      "privateKey must be the PEM contents of the App Store Connect .p8 key file, starting with -----BEGIN PRIVATE KEY-----",
    );
  }

  return {
    keyId: requiredInputString(values.keyId, "keyId"),
    issuerId: optionalString(values.issuerId),
    privateKey,
  };
}

async function signAuthorizationHeader(key: AppStoreConnectKey): Promise<string> {
  const signingKey = await importAppStoreConnectKey(key.privateKey);
  const issuedAt = Math.floor(Date.now() / 1000);
  // A team key is identified by its issuer; an individual key has none and is
  // identified by the fixed subject Apple documents for it.
  const claims = key.issuerId === undefined ? { sub: "user" } : { iss: key.issuerId };
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: key.keyId, typ: "JWT" })
    .setAudience(appStoreConnectAudience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + tokenLifetimeSeconds)
    .sign(signingKey);
  return `Bearer ${token}`;
}

async function importAppStoreConnectKey(privateKey: string): Promise<CryptoKey> {
  try {
    return await importPKCS8(privateKey, "ES256");
  } catch {
    throw new ProviderRequestError(
      400,
      "privateKey must be an EC P-256 private key in PKCS#8 PEM format, as downloaded from App Store Connect",
    );
  }
}
