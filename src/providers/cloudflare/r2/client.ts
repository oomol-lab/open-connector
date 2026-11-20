import type { CloudflareEnvelope } from "../shared/client.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { optionalRecord, optionalString, requiredRawString, requiredString } from "../../../core/cast.ts";
import { queryParams } from "../../../core/request.ts";
import { providerInputError, ProviderRequestError, providerUserAgent } from "../../provider-runtime.ts";
import { cloudflareApiBaseUrl, readCloudflareEnvelope } from "../shared/client.ts";
import { resolveAccountId } from "../shared/context.ts";
import { cloudflareResponseError } from "../shared/errors.ts";

export interface CloudflareR2RequestInput {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
}

export async function resolveR2S3AccessKeyId(accountId: string, context: CloudflareContext): Promise<string> {
  if (context.authType === "oauth2" || !context.authHeaders.authorization)
    throw providerInputError(
      "R2 S3 signing requires an API token. OAuth tokens and Global API Keys cannot derive S3 signing credentials.",
    );
  const existing = optionalString(context.metadata.tokenId);
  if (existing) {
    return existing;
  }
  // Connections validated before validateCloudflareR2Credential stored tokenId
  // still have to discover it here.
  const verification = await verifyCloudflareR2ApiToken(context.accessToken, accountId, context);
  assertActiveCloudflareR2Token(verification);
  if (!verification.tokenId) {
    throw new ProviderRequestError(
      400,
      "Unable to derive R2 S3 Access Key ID from this API token. cloudflare.generate_presigned_url requires a custom API token that can be verified.",
    );
  }
  return verification.tokenId;
}

export function resolveCloudflareR2AccessKeyId(
  input: Record<string, unknown>,
  context: CloudflareContext,
): Promise<string> {
  return resolveR2S3AccessKeyId(resolveAccountId(input, context), context);
}

interface CloudflareR2TokenVerification {
  tokenId?: string;
  tokenStatus?: string;
  validationEndpoint: string;
}

async function verifyCloudflareR2ApiToken(
  apiToken: string,
  accountId: string,
  context: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CloudflareR2TokenVerification> {
  try {
    return await verifyCloudflareR2ApiTokenAt(apiToken, "/user/tokens/verify", context);
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.status !== 400) {
      throw error;
    }
    return verifyCloudflareR2ApiTokenAt(apiToken, `/accounts/${encodeURIComponent(accountId)}/tokens/verify`, context);
  }
}

async function verifyCloudflareR2ApiTokenAt(
  apiToken: string,
  path: string,
  context: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CloudflareR2TokenVerification> {
  // The "validate" phase is deliberate: normalizeCloudflareR2Error collapses 400/401/403/404
  // to 400 only there, which is what lets the user-token to account-token fallback fire.
  const envelope = await requestEnvelope({ authorization: `Bearer ${apiToken}` }, { path }, context, "validate");
  const verification = readObject(envelope.result, "cloudflare token verification");
  return {
    tokenId: optionalString(verification.id),
    tokenStatus: optionalString(verification.status),
    validationEndpoint: path,
  };
}

function assertActiveCloudflareR2Token(verification: CloudflareR2TokenVerification): void {
  if (verification.tokenStatus && verification.tokenStatus !== "active") {
    throw new ProviderRequestError(400, `cloudflare token is not active: ${verification.tokenStatus}`);
  }
}

export function readObjectKey(input: Record<string, unknown>): string {
  const objectKey = requiredRawString(input.objectKey, "objectKey", providerInputError);
  if (objectKey.length === 0) {
    throw providerInputError("objectKey must not be empty");
  }
  if (objectKey.split("/").some((segment) => segment === "." || segment === "..")) {
    throw providerInputError("objectKey must not contain . or .. path segments");
  }
  return objectKey;
}

export function buildR2JurisdictionHeaders(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "cf-r2-jurisdiction": optionalString(input.jurisdiction),
  };
}

export async function requestEnvelope(
  authHeaders: Record<string, string>,
  request: CloudflareR2RequestInput,
  context: { fetcher: typeof fetch; signal?: AbortSignal },
  phase: "validate" | "execute",
): Promise<CloudflareEnvelope> {
  const response = await context.fetcher(buildCloudflareR2Url(request.path, request.query), {
    method: request.method ?? "GET",
    headers: headers(authHeaders, request),
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    signal: context.signal,
  });
  const envelope = await readCloudflareEnvelope(response);
  if (!response.ok || envelope.success === false) {
    throw cloudflareResponseError(response, envelope, phase);
  }
  return envelope;
}

function headers(authHeaders: Record<string, string>, request: CloudflareR2RequestInput): Record<string, string> {
  const headers: Record<string, string> = {
    "accept": "application/json",
    ...authHeaders,
    "user-agent": providerUserAgent,
  };
  if (request.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    if (value !== undefined) {
      headers[key] = value;
    }
  }
  return headers;
}

export function buildCloudflareR2Url(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(`${cloudflareApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed ${label} response`);
  }
  return record;
}

export function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = optionalString(record[field]);
  if (!value) {
    throw new ProviderRequestError(502, `malformed cloudflare r2 response: missing ${field}`);
  }
  return value;
}

export function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => typeof item === "string");
}

export function buildCloudflareR2BucketPath(input: Record<string, unknown>, context: CloudflareContext): string {
  const accountId = resolveAccountId(input, context);
  const bucketName = requiredString(input.bucketName, "bucketName", providerInputError);
  return `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}`;
}

export function readObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `malformed ${label} response`);
  return value.map((item) => readObject(item, label));
}

export function readRequiredBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `malformed cloudflare r2 response: missing ${field}`);
  }
  return value;
}

export function requireObjectKey(value: unknown): string {
  return readObjectKey({ objectKey: value });
}
