import type { ProviderExecutors, ResolvedCredential } from "../core/types.ts";
import type {
  OAuthProviderContext,
  ProviderFetch,
  ProviderProxyAuth,
  ProviderRuntimeHandler,
} from "./provider-runtime.ts";

import { importPKCS8, SignJWT } from "jose";
import { optionalNumberLike, optionalRecord, optionalString } from "../core/cast.ts";
import {
  defineProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "./provider-runtime.ts";

const googleTokenUrl = "https://oauth2.googleapis.com/token";
const jwtBearerGrantType = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/** Google issues one-hour access tokens for JWT bearer grants; assertions may ask for at most one hour. */
const googleTokenLifetimeSeconds = 3600;
/** Mint a fresh token when the cached one has less than five minutes of life left. */
const tokenRefreshSkewMs = 5 * 60_000;

/**
 * A Google service account identity read from a stored custom credential.
 */
interface GoogleServiceAccountCredential {
  /** Service account email, e.g. `bot@project.iam.gserviceaccount.com`. */
  clientEmail: string;
  /** RSA private key in PEM format from the same key file. */
  privateKey: string;
  /** Optional Workspace user to impersonate through domain-wide delegation. */
  subject?: string;
}

/**
 * An access token minted for a service account, with the scopes Google actually granted.
 */
export interface GoogleServiceAccountToken {
  accessToken: string;
  expiresAtMs: number;
  grantedScopes: string[];
}

export interface GoogleServiceAccountTokenRequest {
  service: string;
  serviceAccount: GoogleServiceAccountCredential;
  scopes: readonly string[];
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

/**
 * Read the stored values of a Google provider custom credential into a service
 * account identity. `serviceAccountJson` must be the complete key JSON file
 * downloaded from Google Cloud Console; escaped `\\n` line breaks in the
 * private key are accepted.
 */
export function readGoogleServiceAccountCredential(
  values: Record<string, string | undefined>,
): GoogleServiceAccountCredential {
  const raw = requiredInputString(values.serviceAccountJson, "serviceAccountJson");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw providerInputError(
      "serviceAccountJson must be the complete service account key JSON downloaded from Google Cloud Console.",
    );
  }
  const keyFile = optionalRecord(parsed);
  if (!keyFile) {
    throw providerInputError(
      "serviceAccountJson must be the complete service account key JSON downloaded from Google Cloud Console.",
    );
  }
  return {
    clientEmail: requiredInputString(keyFile.client_email, "serviceAccountJson client_email"),
    privateKey: requiredInputString(keyFile.private_key, "serviceAccountJson private_key").replaceAll("\\n", "\n"),
    subject: optionalString(values.subject),
  };
}

const serviceAccountTokenCache = new Map<string, GoogleServiceAccountToken>();

/**
 * Return an access token for the service account, minting one through the
 * Google JWT bearer grant when no cached token is still usable. Tokens are
 * cached per (service account, subject, scope) key until shortly before expiry.
 */
export async function createGoogleServiceAccountToken(
  input: GoogleServiceAccountTokenRequest,
): Promise<GoogleServiceAccountToken> {
  const cacheKey = [input.serviceAccount.clientEmail, input.serviceAccount.subject ?? "", ...input.scopes].join("\n");
  const cached = serviceAccountTokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs - tokenRefreshSkewMs > Date.now()) {
    return cached;
  }
  const token = await mintGoogleServiceAccountToken(input);
  serviceAccountTokenCache.set(cacheKey, token);
  return token;
}

async function mintGoogleServiceAccountToken(
  input: GoogleServiceAccountTokenRequest,
): Promise<GoogleServiceAccountToken> {
  const assertion = await signServiceAccountAssertion(input.serviceAccount, input.scopes);
  return runProviderRequest(
    { label: `${input.service} service account token`, signal: input.signal },
    async (signal) => {
      const response = await input.fetcher(googleTokenUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": providerUserAgent,
        },
        body: new URLSearchParams({ grant_type: jwtBearerGrantType, assertion }),
        signal,
      });
      const payload = optionalRecord(await response.json().catch(() => undefined)) ?? {};
      const accessToken = optionalString(payload.access_token);
      if (!response.ok || !accessToken) {
        const description = optionalString(payload.error_description) ?? optionalString(payload.error);
        throw new ProviderRequestError(
          response.status,
          description ?? `${input.service} service account token request failed with HTTP ${response.status}`,
          payload,
        );
      }
      return {
        accessToken,
        expiresAtMs: Date.now() + tokenLifetimeSeconds(payload) * 1000,
        grantedScopes: optionalString(payload.scope)?.split(" ") ?? [...input.scopes],
      };
    },
  );
}

function tokenLifetimeSeconds(payload: Record<string, unknown>): number {
  const seconds = optionalNumberLike(payload.expires_in);
  return seconds !== undefined && seconds > 0 ? seconds : googleTokenLifetimeSeconds;
}

async function signServiceAccountAssertion(
  serviceAccount: GoogleServiceAccountCredential,
  scopes: readonly string[],
): Promise<string> {
  let key: CryptoKey;
  try {
    key = await importPKCS8(serviceAccount.privateKey, "RS256");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw providerInputError(`serviceAccountJson private_key is not a valid RSA PEM key: ${reason}`);
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = new SignJWT({ scope: scopes.join(" ") })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.clientEmail)
    .setAudience(googleTokenUrl)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + googleTokenLifetimeSeconds);
  return serviceAccount.subject ? assertion.setSubject(serviceAccount.subject).sign(key) : assertion.sign(key);
}

interface GoogleAccessTokenInput {
  /** Provider slug used in errors, e.g. `googledrive`. */
  service: string;
  /** Provider-native scopes the minted token must carry. */
  scopes: readonly string[];
  /** The credential stored for the provider, if any. */
  credential: ResolvedCredential | undefined;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

/**
 * The bearer identity Google API calls should use, from either stored OAuth
 * credentials or a minted service account token.
 */
interface GoogleAccessToken {
  accessToken: string;
  tokenType: string;
  accountId: string;
}

/**
 * Resolve the access token for a Google provider from either auth mode:
 * an `oauth2` credential passes its stored token through, while a
 * `custom_credential` mints a service account token for the provider scopes.
 */
export async function resolveGoogleAccessToken(input: GoogleAccessTokenInput): Promise<GoogleAccessToken> {
  const credential = input.credential;
  if (credential?.authType === "oauth2") {
    return {
      accessToken: credential.accessToken,
      tokenType: credential.tokenType,
      accountId: credential.profile.accountId,
    };
  }
  if (credential?.authType === "custom_credential") {
    const serviceAccount = readGoogleServiceAccountCredential(credential.values);
    const token = await createGoogleServiceAccountToken({
      service: input.service,
      serviceAccount,
      scopes: input.scopes,
      fetcher: input.fetcher,
      signal: input.signal,
    });
    return {
      accessToken: token.accessToken,
      tokenType: "Bearer",
      accountId: serviceAccount.subject ?? serviceAccount.clientEmail,
    };
  }
  throw new ProviderRequestError(401, `Connect ${input.service} with OAuth or service account credentials first.`);
}

interface GoogleProviderExecutorsOptions {
  /** Provider-native scopes a minted service account token carries; see the provider `scopes.ts`. */
  scopes: readonly string[];
}

/**
 * Define executors for a Google provider that accepts both OAuth connections
 * and service account custom credentials. Action handlers keep receiving the
 * regular {@link OAuthProviderContext} in both cases.
 */
export function defineGoogleProviderExecutors(
  service: string,
  handlers: Record<string, ProviderRuntimeHandler<OAuthProviderContext>>,
  options: GoogleProviderExecutorsOptions,
): ProviderExecutors {
  return defineProviderExecutors<OAuthProviderContext>({
    service,
    handlers,
    async createContext(context, fetcher): Promise<OAuthProviderContext> {
      const resolved = await resolveGoogleAccessToken({
        service,
        scopes: options.scopes,
        credential: await context.getCredential(service),
        fetcher,
        signal: context.signal,
      });
      const providerContext: OAuthProviderContext = {
        accessToken: resolved.accessToken,
        tokenType: resolved.tokenType,
        accountId: resolved.accountId,
        fetcher,
        signal: context.signal,
      };
      if (context.transitFiles) {
        providerContext.transitFiles = context.transitFiles;
      }
      return providerContext;
    },
  });
}

/**
 * Proxy auth for Google providers: the request carries the stored OAuth token,
 * or a service account token minted for `scopes` when the connection is a
 * service account credential. Pass it to {@link defineProviderProxy} as
 * `auth`.
 */
export function googleBearerProxyAuth(scopes: readonly string[]): ProviderProxyAuth {
  return {
    type: "bearer_resolver",
    async resolve({ context, service, fetcher }) {
      const resolved = await resolveGoogleAccessToken({
        service,
        scopes,
        credential: await context.getCredential(service),
        fetcher,
      });
      return { accessToken: resolved.accessToken, tokenType: resolved.tokenType };
    },
  };
}
