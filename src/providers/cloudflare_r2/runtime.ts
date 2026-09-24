import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { CloudflareCurrentUser } from "../cloudflare_dns/runtime-user.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { CloudflareR2PresignedMethod } from "./s3-presign.ts";

import {
  base64Bytes,
  compactObject,
  integer,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRawString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, queryParams, readBoundedResponseBytes } from "../../core/request.ts";
import { readCloudflareCurrentUser } from "../cloudflare_dns/runtime-user.ts";
import {
  combineProviderActionHandlers,
  providerFetch,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";
import { cloudflareR2AccountActionHandlers } from "./runtime-account.ts";
import { cloudflareR2BucketSettingsActionHandlers } from "./runtime-bucket-settings.ts";
import { cloudflareR2DomainActionHandlers } from "./runtime-domains.ts";
import { cloudflareR2EventNotificationActionHandlers } from "./runtime-event-notifications.ts";
import { cloudflareR2ObjectActionHandlers } from "./runtime-objects.ts";
import { createCloudflareR2PresignedUrl, deriveCloudflareR2S3SecretAccessKey } from "./s3-presign.ts";

export interface CloudflareR2Context {
  authType: "custom_credential" | "oauth2";
  accessToken: string;
  accountId?: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

interface CloudflareR2Envelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
  messages?: unknown;
  result_info?: unknown;
}

interface CloudflareR2RequestInput {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
}

interface CloudflareR2Account {
  id: string;
  name?: string;
  type?: string;
}

export const cloudflareR2ApiBaseUrl = "https://api.cloudflare.com/client/v4";

export const cloudflareR2ActionHandlers: ProviderActionHandlers<
  "cloudflare_r2",
  ProviderRuntimeHandler<CloudflareR2Context>
> = combineProviderActionHandlers(
  "cloudflare_r2",
  cloudflareR2ObjectActionHandlers,
  cloudflareR2DomainActionHandlers,
  cloudflareR2BucketSettingsActionHandlers,
  cloudflareR2EventNotificationActionHandlers,
  cloudflareR2AccountActionHandlers,
  {
    list_accounts(input, context) {
      return listAccounts(input, context);
    },
    list_buckets(input, context) {
      return listBuckets(input, context);
    },
    get_bucket(input, context) {
      return getBucket(input, context);
    },
    download_object(input, context) {
      return downloadObject(input, context);
    },
    create_bucket(input, context) {
      return createBucket(input, context);
    },
    update_bucket(input, context) {
      return updateBucket(input, context);
    },
    delete_bucket(input, context) {
      return deleteBucket(input, context);
    },
    get_bucket_cors_policy(input, context) {
      return getBucketCorsPolicy(input, context);
    },
    update_bucket_cors_policy(input, context) {
      return updateBucketCorsPolicy(input, context);
    },
    delete_bucket_cors_policy(input, context) {
      return deleteBucketCorsPolicy(input, context);
    },
    put_object(input, context) {
      return putObject(input, context);
    },
    generate_presigned_url(input, context) {
      return generatePresignedUrl(input, context);
    },
  },
);

export async function validateCloudflareR2Credential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiToken = requiredString(values.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const accountId = requiredString(values.accountId, "accountId", (message) => new ProviderRequestError(400, message));
  const envelope = await cloudflareR2RequestEnvelope(
    apiToken,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets`,
      query: { per_page: 1 },
    },
    { fetcher, signal },
    "validate",
  );
  const result = optionalRecord(envelope.result);
  const buckets = normalizeR2BucketList(result?.buckets ?? []);
  const firstBucket = buckets[0];
  // The verified token id is the R2 S3 Access Key ID, so storing it here keeps
  // generate_presigned_url from re-verifying the token on every call.
  const verification = await verifyCloudflareR2ApiToken(apiToken, accountId, { fetcher, signal });
  assertActiveCloudflareR2Token(verification);
  return {
    profile: {
      accountId,
      displayName: optionalString(firstBucket?.name) ? `Cloudflare R2 - ${String(firstBucket?.name)}` : "Cloudflare R2",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: `/accounts/${accountId}/r2/buckets?per_page=1`,
      accountId,
      firstBucketName: optionalString(firstBucket?.name),
      tokenId: verification.tokenId,
      tokenStatus: verification.tokenStatus,
    }),
  };
}

export async function requestCloudflareR2Accounts(
  apiToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  input: { page?: number; perPage?: number } = {},
): Promise<{ accounts: CloudflareR2Account[]; resultInfo?: Record<string, unknown> }> {
  const envelope = await cloudflareR2RequestEnvelope(
    apiToken,
    {
      path: "/accounts",
      query: {
        page: input.page ?? 1,
        per_page: input.perPage ?? 50,
      },
    },
    { fetcher, signal },
    "execute",
  );
  if (!Array.isArray(envelope.result)) {
    throw new ProviderRequestError(502, "malformed cloudflare accounts response");
  }
  return {
    accounts: envelope.result.map((item) => normalizeAccount(item)),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

export async function requestCloudflareR2CurrentUser(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CloudflareCurrentUser> {
  const envelope = await cloudflareR2RequestEnvelope(accessToken, { path: "/user" }, { fetcher, signal }, "validate");
  return readCloudflareCurrentUser(envelope.result);
}

async function listAccounts(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  return requestCloudflareR2Accounts(context.accessToken, context.fetcher, context.signal, {
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.perPage),
  });
}

async function listBuckets(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets`,
      query: {
        cursor: optionalString(input.cursor),
        direction: optionalString(input.direction),
        name_contains: optionalString(input.nameContains),
        order: optionalString(input.order),
        per_page: optionalInteger(input.perPage),
      },
    },
    "execute",
  );
  const result = readObject(envelope.result, "cloudflare r2 bucket list");
  return {
    buckets: normalizeR2BucketList(result.buckets ?? []),
    cursor: optionalString(result.cursor),
  };
}

async function getBucket(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}`,
      headers: buildR2JurisdictionHeaders(input),
    },
    "execute",
  );
  return {
    bucket: normalizeR2Bucket(envelope.result),
  };
}

async function downloadObject(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "cloudflare_r2 download_object requires local transit file storage");
  }

  const accountId = resolveAccountId(input, context);
  const bucketName = requiredString(input.bucketName, "bucketName", providerInputError);
  const objectKey = readObjectKey(input);
  const url = buildCloudflareR2Url(
    `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeR2ObjectKeyPath(objectKey)}`,
  );
  const headers: Record<string, string> = {
    accept: "*/*",
    authorization: `Bearer ${context.accessToken}`,
    "user-agent": providerUserAgent,
  };
  const jurisdiction = optionalString(input.jurisdiction);
  if (jurisdiction) {
    headers["cf-r2-jurisdiction"] = jurisdiction;
  }
  const response = await context.fetcher(url, {
    headers,
    signal: context.signal,
  });
  if (!response.ok) {
    const envelope = await readCloudflareR2Envelope(response);
    throw normalizeCloudflareR2Error(response, envelope, "execute");
  }

  const name = optionalString(input.fileName) ?? defaultObjectFileName(objectKey);
  const mimeType = optionalString(response.headers.get("content-type")) ?? "application/octet-stream";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Cloudflare R2 download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const file = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));

  return {
    fileId: objectKey,
    name,
    mimeType,
    sizeBytes: file.sizeBytes,
    file,
  };
}

async function createBucket(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const envelope = await requestEnvelope(
    context,
    {
      method: "POST",
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets`,
      body: compactObject({
        name: optionalString(input.name),
        locationHint: optionalString(input.locationHint),
      }),
      headers: {
        ...buildR2JurisdictionHeaders(input),
        "cf-r2-storage-class": optionalString(input.storageClass),
      },
    },
    "execute",
  );
  return {
    bucket: normalizeR2Bucket(envelope.result),
  };
}

async function updateBucket(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  if (input.storageClass === undefined && input.jurisdiction === undefined) {
    throw new ProviderRequestError(400, "storageClass or jurisdiction is required");
  }
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PATCH",
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}`,
      headers: {
        ...buildR2JurisdictionHeaders(input),
        "cf-r2-storage-class": optionalString(input.storageClass),
      },
    },
    "execute",
  );
  return {
    bucket: normalizeR2Bucket(envelope.result),
  };
}

async function deleteBucket(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  await requestEnvelope(
    context,
    {
      method: "DELETE",
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}`,
      headers: buildR2JurisdictionHeaders(input),
    },
    "execute",
  );
  return {
    bucketName,
    deleted: true,
  };
}

async function getBucketCorsPolicy(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/cors`,
      headers: buildR2JurisdictionHeaders(input),
    },
    "execute",
  );
  const result = readObject(envelope.result, "cloudflare r2 bucket cors policy");
  return {
    rules: normalizeR2CorsRuleList(result.rules ?? []),
  };
}

async function updateBucketCorsPolicy(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  await requestEnvelope(
    context,
    {
      method: "PUT",
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/cors`,
      body: {
        rules: normalizeCorsRuleRequestList(input.rules),
      },
      headers: buildR2JurisdictionHeaders(input),
    },
    "execute",
  );
  return {
    bucketName,
    updated: true,
  };
}

async function deleteBucketCorsPolicy(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  await requestEnvelope(
    context,
    {
      method: "DELETE",
      path: `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/cors`,
      headers: buildR2JurisdictionHeaders(input),
    },
    "execute",
  );
  return {
    bucketName,
    deleted: true,
  };
}

const defaultPresignExpiresSeconds = 3600;
const maxPresignExpiresSeconds = 604800;

const maxSourceBytes = 20 * 1024 * 1024;
const sourceFetchTimeoutMs = 15_000;

async function putObject(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  const accountId = resolveAccountId(input, context);
  const bucketName = requiredString(input.bucketName, "bucketName", providerInputError);
  const objectKey = readObjectKey(input);
  const sourceUrl =
    input.sourceUrl != null ? requiredString(input.sourceUrl, "sourceUrl", providerInputError) : undefined;
  const sourceFile = sourceUrl ? await downloadSourceFile(sourceUrl, context.signal) : null;
  const resolvedContentType = normalizeContentType(input.contentType) ?? sourceFile?.contentType;
  const body = sourceFile
    ? Uint8Array.from(sourceFile.bytes)
    : input.contentBase64 != null
      ? base64Bytes(input.contentBase64, "contentBase64", providerInputError)
      : Buffer.from(String(input.contentText ?? ""), "utf8");
  const headers: Record<string, string | undefined> = {
    ...buildR2JurisdictionHeaders(input),
    "content-type": resolvedContentType,
  };
  const response = await context.fetcher(
    buildCloudflareR2Url(
      `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeR2ObjectKeyPath(objectKey)}`,
    ),
    {
      method: "PUT",
      headers: compactObject({
        accept: "application/json",
        authorization: `Bearer ${context.accessToken}`,
        "user-agent": providerUserAgent,
        ...headers,
      }),
      body,
      signal: context.signal,
    },
  );
  const envelope = await readCloudflareR2Envelope(response);
  if (!response.ok || envelope.success === false) {
    throw normalizeCloudflareR2Error(response, envelope, "execute");
  }
  const resultRecord = optionalRecord(envelope.result);
  return {
    bucketName,
    objectKey,
    etag: normalizeEtag(optionalString(resultRecord?.etag) ?? optionalString(response.headers.get("etag"))),
  };
}

// R2 returns a bare hex ETag in the JSON envelope and a quoted one in the HTTP
// header, so both fallback paths have to converge on the same unquoted form.
function normalizeEtag(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

async function downloadSourceFile(
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; contentType?: string }> {
  const validatedUrl = assertPublicHttpUrl(sourceUrl, {
    fieldName: "sourceUrl",
    createError: providerInputError,
  });
  return runProviderRequest({ signal, timeoutMs: sourceFetchTimeoutMs, label: "sourceUrl" }, async (requestSignal) => {
    const response = await providerFetch(validatedUrl, { signal: requestSignal });
    if (!response.ok) {
      // An upstream 401/403 is not our authorization failure, so it must not
      // pass through as this action's own status.
      const message = `failed to download sourceUrl: ${response.status} ${response.statusText}`.trim();
      throw response.status >= 500 ? new ProviderRequestError(502, message) : providerInputError(message);
    }
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: maxSourceBytes,
      fieldName: "sourceUrl",
      createError: providerInputError,
    });
    return {
      bytes,
      contentType: response.headers.get("content-type") ?? undefined,
    };
  });
}

async function generatePresignedUrl(input: Record<string, unknown>, context: CloudflareR2Context): Promise<unknown> {
  if (context.authType !== "custom_credential") {
    throw new ProviderRequestError(
      400,
      "cloudflare_r2.generate_presigned_url requires a custom API token credential. OAuth connections cannot mint R2 S3 signatures.",
      {
        action: "cloudflare_r2.generate_presigned_url",
        authType: context.authType,
        requiredAuthType: "custom_credential",
      },
    );
  }

  const accountId = resolveAccountId(input, context);
  const bucketName = requiredString(input.bucketName, "bucketName", providerInputError);
  const objectKey = readObjectKey(input);
  const method = normalizePresignedMethod(input.method);
  const expiresSeconds = normalizeExpiresSeconds(input.expiresSeconds);
  const contentType = method === "PUT" ? normalizeContentType(input.contentType) : undefined;
  const jurisdiction = optionalString(input.jurisdiction);
  const accessKeyId = await resolveR2S3AccessKeyId(accountId, context);

  return {
    bucketName,
    objectKey,
    ...createCloudflareR2PresignedUrl({
      accountId,
      accessKeyId,
      secretAccessKey: deriveCloudflareR2S3SecretAccessKey(context.accessToken),
      bucketName,
      objectKey,
      method,
      expiresSeconds,
      contentType,
      jurisdiction,
    }),
  };
}

async function resolveR2S3AccessKeyId(accountId: string, context: CloudflareR2Context): Promise<string> {
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
      "Unable to derive R2 S3 Access Key ID from this API token. cloudflare_r2.generate_presigned_url requires a custom API token that can be verified.",
    );
  }
  return verification.tokenId;
}

export function resolveCloudflareR2AccessKeyId(
  input: Record<string, unknown>,
  context: CloudflareR2Context,
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
  const envelope = await cloudflareR2RequestEnvelope(apiToken, { path }, context, "validate");
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

function normalizePresignedMethod(value: unknown): Exclude<CloudflareR2PresignedMethod, "DELETE"> {
  if (value === undefined || value === "GET") {
    return "GET";
  }
  if (value === "PUT" || value === "HEAD") {
    return value;
  }
  throw providerInputError("method must be GET, PUT, or HEAD");
}

function normalizeExpiresSeconds(value: unknown): number {
  if (value === undefined) {
    return defaultPresignExpiresSeconds;
  }
  const parsed = integer(value, "expiresSeconds", providerInputError);
  if (parsed < 1 || parsed > maxPresignExpiresSeconds) {
    throw providerInputError("expiresSeconds must be an integer between 1 and 604800");
  }
  return parsed;
}

function normalizeContentType(value: unknown): string | undefined {
  const contentType = optionalString(value);
  if (!contentType) {
    return undefined;
  }
  try {
    // A CRLF or NUL would make the signer's Headers.set throw a raw TypeError.
    new Headers({ "content-type": contentType });
  } catch {
    throw providerInputError("contentType must be a valid HTTP header value");
  }
  return contentType;
}

function readObjectKey(input: Record<string, unknown>): string {
  const objectKey = requiredRawString(input.objectKey, "objectKey", providerInputError);
  if (objectKey.length === 0) {
    throw providerInputError("objectKey must not be empty");
  }
  if (objectKey.split("/").some((segment) => segment === "." || segment === "..")) {
    throw providerInputError("objectKey must not contain . or .. path segments");
  }
  return objectKey;
}

export function resolveAccountId(input: Record<string, unknown>, context: CloudflareR2Context): string {
  const inputAccountId = optionalString(input.accountId);
  const accountId = context.accountId ?? optionalString(context.metadata.accountId) ?? inputAccountId;
  if (!accountId) {
    throw new ProviderRequestError(
      400,
      context.authType === "oauth2"
        ? "accountId is required for this Cloudflare R2 action. Use list_accounts to find an accessible Cloudflare account ID."
        : "accountId is required in the connected credential",
    );
  }
  if (context.authType === "custom_credential" && inputAccountId && inputAccountId !== accountId) {
    throw new ProviderRequestError(400, "accountId must match the connected credential");
  }
  ensureAccountIsAvailable(accountId, context.metadata);
  return accountId;
}

function ensureAccountIsAvailable(accountId: string, metadata: Record<string, unknown>): void {
  if (!Array.isArray(metadata.availableAccounts)) {
    return;
  }
  const matched = metadata.availableAccounts.some((item) => {
    const account = optionalRecord(item);
    return optionalString(account?.id) === accountId;
  });
  if (!matched) {
    throw new ProviderRequestError(
      400,
      "accountId must be one of the Cloudflare accounts accessible by this OAuth credential",
    );
  }
}

export function buildR2JurisdictionHeaders(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "cf-r2-jurisdiction": optionalString(input.jurisdiction),
  };
}

export function encodeR2ObjectKeyPath(objectKey: string): string {
  return objectKey.split("/").map(encodeR2ObjectKeySegment).join("/");
}

function encodeR2ObjectKeySegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

function defaultObjectFileName(objectKey: string): string {
  return objectKey.split("/").findLast((segment) => segment.length > 0) ?? "r2-object";
}

async function requestEnvelope(
  context: CloudflareR2Context,
  request: CloudflareR2RequestInput,
  phase: "validate" | "execute",
): Promise<CloudflareR2Envelope> {
  return cloudflareR2RequestEnvelope(context.accessToken, request, context, phase);
}

export async function cloudflareR2RequestEnvelope(
  apiToken: string,
  request: CloudflareR2RequestInput,
  context: { fetcher: typeof fetch; signal?: AbortSignal },
  phase: "validate" | "execute",
): Promise<CloudflareR2Envelope> {
  const response = await context.fetcher(buildCloudflareR2Url(request.path, request.query), {
    method: request.method ?? "GET",
    headers: cloudflareR2Headers(apiToken, request),
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    signal: context.signal,
  });
  const envelope = await readCloudflareR2Envelope(response);
  if (!response.ok || envelope.success === false) {
    throw normalizeCloudflareR2Error(response, envelope, phase);
  }
  return envelope;
}

function cloudflareR2Headers(apiToken: string, request: CloudflareR2RequestInput): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiToken}`,
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

function buildCloudflareR2Url(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${cloudflareR2ApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function readCloudflareR2Envelope(response: Response): Promise<CloudflareR2Envelope> {
  try {
    return (await response.json()) as CloudflareR2Envelope;
  } catch {
    const text = (await response.text().catch(() => "")) || `cloudflare r2 request failed with ${response.status}`;
    return {
      success: false,
      errors: [{ message: text }],
    };
  }
}

function normalizeCloudflareR2Error(
  response: Response,
  envelope: CloudflareR2Envelope,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readCloudflareR2ErrorMessage(envelope, response.status);
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && [400, 401, 403, 404].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 404)) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function readCloudflareR2ErrorMessage(envelope: CloudflareR2Envelope, status: number): string {
  for (const error of Array.isArray(envelope.errors) ? envelope.errors : []) {
    const record = optionalRecord(error);
    const message = optionalString(record?.message);
    if (message) {
      return message;
    }
  }
  for (const messageEntry of Array.isArray(envelope.messages) ? envelope.messages : []) {
    const record = optionalRecord(messageEntry);
    const message = optionalString(record?.message);
    if (message) {
      return message;
    }
  }
  return `cloudflare r2 request failed with ${status}`;
}

function normalizeAccount(value: unknown): CloudflareR2Account {
  const account = readObject(value, "cloudflare account");
  return compactObject({
    id: readRequiredString(account, "id"),
    name: optionalString(account.name),
    type: optionalString(account.type),
  }) as CloudflareR2Account;
}

function normalizeResultInfo(value: unknown): Record<string, unknown> | undefined {
  const resultInfo = optionalRecord(value);
  if (!resultInfo) {
    return undefined;
  }
  return compactObject({
    page: optionalInteger(resultInfo.page),
    perPage: optionalInteger(resultInfo.per_page),
    count: optionalInteger(resultInfo.count),
    totalCount: optionalInteger(resultInfo.total_count),
    totalPages: optionalInteger(resultInfo.total_pages),
  });
}

function normalizeR2BucketList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare r2 bucket list response");
  }
  return value.map((item) => normalizeR2Bucket(item));
}

function normalizeR2Bucket(value: unknown): Record<string, unknown> {
  const bucket = readObject(value, "cloudflare r2 bucket");
  return compactObject({
    name: readRequiredString(bucket, "name"),
    creationDate: optionalString(bucket.creation_date),
    location: optionalString(bucket.location),
    jurisdiction: optionalString(bucket.jurisdiction),
    storageClass: optionalString(bucket.storage_class),
  });
}

function normalizeR2CorsRuleList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare r2 cors policy response");
  }
  return value.map((item) => normalizeR2CorsRule(item));
}

function normalizeR2CorsRule(value: unknown): Record<string, unknown> {
  const rule = readObject(value, "cloudflare r2 cors rule");
  const allowed = readObject(rule.allowed, "cloudflare r2 cors allowed");
  return compactObject({
    id: optionalString(rule.id),
    allowed: compactObject({
      methods: readRequiredStringArray(allowed, "methods"),
      origins: readRequiredStringArray(allowed, "origins"),
      headers: readOptionalStringArray(allowed.headers),
    }),
    exposeHeaders: readOptionalStringArray(rule.exposeHeaders ?? rule.expose_headers),
    maxAgeSeconds: optionalInteger(rule.maxAgeSeconds ?? rule.max_age_seconds),
  });
}

function normalizeCorsRuleRequestList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "rules must be an array");
  }
  return value.map((item) => normalizeCorsRuleRequest(item));
}

function normalizeCorsRuleRequest(value: unknown): Record<string, unknown> {
  const rule = readObject(value, "cloudflare r2 cors rule input");
  const allowed = readObject(rule.allowed, "cloudflare r2 cors allowed input");
  return compactObject({
    id: optionalString(rule.id),
    allowed: compactObject({
      methods: readRequiredStringArray(allowed, "methods"),
      origins: readRequiredStringArray(allowed, "origins"),
      headers: readOptionalStringArray(allowed.headers),
    }),
    exposeHeaders: readOptionalStringArray(rule.exposeHeaders),
    maxAgeSeconds: optionalInteger(rule.maxAgeSeconds),
  });
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

function readRequiredStringArray(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `malformed cloudflare r2 response: missing ${field}`);
  }
  return value.map((item) => String(item));
}

export function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => typeof item === "string");
}

export function buildCloudflareR2BucketPath(input: Record<string, unknown>, context: CloudflareR2Context): string {
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
