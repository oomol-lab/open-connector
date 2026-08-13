import type { ResolvedCredential } from "../core/types.ts";

import { optionalString } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";
import { providerFetch } from "../providers/provider-runtime.ts";

const oauth1ResponseMaxBytes = 64 * 1024;

export interface OAuth1TemporaryCredential {
  token: string;
  tokenSecret: string;
}

interface OAuth1ClientCredentials {
  clientId: string;
  clientSecret: string;
}

interface OAuth1RequestTokenInput extends OAuth1ClientCredentials {
  requestTokenUrl: string;
  callbackUrl: string;
  createError(message: string): Error;
}

interface OAuth1AccessTokenInput extends OAuth1ClientCredentials {
  accessTokenUrl: string;
  service: string;
  requestToken: string;
  requestTokenSecret: string;
  verifier: string;
  createError(message: string): Error;
}

interface SignedOAuth1RequestInput extends OAuth1ClientCredentials {
  url: string;
  token?: string;
  tokenSecret?: string;
  extraOAuthParameters?: Record<string, string>;
  createError(message: string): Error;
}

export async function requestOAuth1TemporaryCredential(
  input: OAuth1RequestTokenInput,
): Promise<OAuth1TemporaryCredential> {
  const payload = await executeSignedOAuth1Request({
    ...input,
    url: input.requestTokenUrl,
    extraOAuthParameters: { oauth_callback: input.callbackUrl },
  });
  if (payload.get("oauth_callback_confirmed") !== "true") {
    throw input.createError("OAuth request-token response did not confirm the callback URL.");
  }
  return readOAuth1Credential(payload, input.createError, "request-token");
}

export async function requestOAuth1AccessCredential(
  input: OAuth1AccessTokenInput,
): Promise<Extract<ResolvedCredential, { authType: "oauth1" }>> {
  const payload = await executeSignedOAuth1Request({
    ...input,
    url: input.accessTokenUrl,
    token: input.requestToken,
    tokenSecret: input.requestTokenSecret,
    extraOAuthParameters: { oauth_verifier: input.verifier },
  });
  const credential = readOAuth1Credential(payload, input.createError, "access-token");
  return {
    authType: "oauth1",
    accessToken: credential.token,
    providerSecret: { oauthTokenSecret: credential.tokenSecret },
    profile: {
      accountId: `${input.service}:oauth1`,
      displayName: `${input.service} OAuth Credential`,
      grantedScopes: [],
    },
    metadata: {},
  };
}

async function executeSignedOAuth1Request(input: SignedOAuth1RequestInput): Promise<URLSearchParams> {
  const url = new URL(input.url);
  const oauthParameters: Record<string, string> = {
    oauth_consumer_key: input.clientId,
    oauth_nonce: crypto.randomUUID().replaceAll("-", ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
    ...(input.token ? { oauth_token: input.token } : {}),
    ...(input.extraOAuthParameters ?? {}),
  };
  oauthParameters.oauth_signature = await createOAuth1Signature({
    method: "POST",
    url,
    parameters: oauthParameters,
    clientSecret: input.clientSecret,
    tokenSecret: input.tokenSecret ?? "",
  });

  let response: Response;
  try {
    response = await providerFetch(url, {
      method: "POST",
      headers: {
        accept: "application/x-www-form-urlencoded",
        authorization: createOAuth1AuthorizationHeader(oauthParameters),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw input.createError(
      error instanceof Error ? `OAuth token request failed: ${error.message}` : "OAuth token request failed.",
    );
  }

  const body = new TextDecoder().decode(
    await readBoundedResponseBytes(response, {
      maxBytes: oauth1ResponseMaxBytes,
      fieldName: "OAuth token response",
      createError: input.createError,
    }),
  );
  const payload = new URLSearchParams(body);
  if (!response.ok) {
    const problem = optionalString(payload.get("oauth_problem"));
    throw input.createError(
      problem ? `OAuth token request failed: ${problem}.` : `OAuth token request failed (HTTP ${response.status}).`,
    );
  }
  return payload;
}

export interface OAuth1SignatureInput {
  method: string;
  url: URL;
  parameters: Record<string, string>;
  clientSecret: string;
  tokenSecret: string;
}

/** Create an RFC 5849 HMAC-SHA1 signature for one OAuth 1.0 request. */
export async function createOAuth1Signature(input: OAuth1SignatureInput): Promise<string> {
  const parameters: Array<[string, string]> = [];
  for (const [key, value] of input.url.searchParams) {
    parameters.push([oauthPercentEncode(key), oauthPercentEncode(value)]);
  }
  for (const [key, value] of Object.entries(input.parameters)) {
    if (key !== "oauth_signature") {
      parameters.push([oauthPercentEncode(key), oauthPercentEncode(value)]);
    }
  }
  parameters.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey === rightKey ? compareEncoded(leftValue, rightValue) : compareEncoded(leftKey, rightKey),
  );

  const normalizedParameters = parameters.map(([key, value]) => `${key}=${value}`).join("&");
  const baseUrl = `${input.url.protocol}//${input.url.host}${input.url.pathname}`;
  const signatureBase = [
    input.method.toUpperCase(),
    oauthPercentEncode(baseUrl),
    oauthPercentEncode(normalizedParameters),
  ].join("&");
  const signingKey = `${oauthPercentEncode(input.clientSecret)}&${oauthPercentEncode(input.tokenSecret)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signatureBase));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function createOAuth1AuthorizationHeader(parameters: Record<string, string>): string {
  return `OAuth ${Object.entries(parameters)
    .sort(([left], [right]) => compareEncoded(left, right))
    .map(([key, value]) => `${oauthPercentEncode(key)}="${oauthPercentEncode(value)}"`)
    .join(", ")}`;
}

function compareEncoded(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function oauthPercentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function readOAuth1Credential(
  payload: URLSearchParams,
  createError: (message: string) => Error,
  phase: string,
): OAuth1TemporaryCredential {
  const token = payload.get("oauth_token")?.trim();
  const tokenSecret = payload.get("oauth_token_secret")?.trim();
  if (!token || !tokenSecret) {
    throw createError(`OAuth ${phase} response is missing oauth_token or oauth_token_secret.`);
  }
  return { token, tokenSecret };
}
