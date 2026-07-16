import { createRemoteJWKSet, jwtVerify } from "jose";

export interface RuntimeJwtConfig {
  jwksUri?: string;
  issuer?: string;
  audience?: string;
}

export type RuntimeJwtVerifier = (token: string) => Promise<boolean>;

/**
 * Creates a JWT access-token verifier when all runtime JWT settings are configured.
 */
export function createRuntimeJwtVerifier(config: RuntimeJwtConfig): RuntimeJwtVerifier | undefined {
  const jwksUri = config.jwksUri?.trim();
  const issuer = config.issuer?.trim();
  const audience = config.audience?.trim();
  if (!jwksUri && !issuer && !audience) {
    return undefined;
  }

  if (!jwksUri || !issuer || !audience) {
    const missing = [
      ["OOMOL_CONNECT_JWKS_URI", jwksUri],
      ["OOMOL_CONNECT_JWT_ISSUER", issuer],
      ["OOMOL_CONNECT_JWT_AUDIENCE", audience],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(`Runtime JWT authentication settings must be configured together; missing: ${missing.join(", ")}.`);
  }

  let url: URL;
  try {
    url = new URL(jwksUri);
  } catch {
    throw new Error("OOMOL_CONNECT_JWKS_URI must be a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("OOMOL_CONNECT_JWKS_URI must be a valid HTTP or HTTPS URL.");
  }

  const jwks = createRemoteJWKSet(url);
  return async (token) => {
    try {
      await jwtVerify(token, jwks, { issuer, audience });
      return true;
    } catch {
      return false;
    }
  };
}
