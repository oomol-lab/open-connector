import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { CloudflareR2ActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface CloudflareR2Context {
  authType: "custom_credential" | "oauth2";
  accessToken: string;
  accountId?: string;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
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

export const cloudflareR2ActionHandlers: Record<CloudflareR2ActionName, ProviderRuntimeHandler<CloudflareR2Context>> = {
  list_accounts(input, context) {
    return listAccounts(input, context);
  },
  list_buckets(input, context) {
    return listBuckets(input, context);
  },
  get_bucket(input, context) {
    return getBucket(input, context);
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
};

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
      headers: buildJurisdictionHeaders(input),
    },
    "execute",
  );
  return {
    bucket: normalizeR2Bucket(envelope.result),
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
        ...buildJurisdictionHeaders(input),
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
        ...buildJurisdictionHeaders(input),
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
      headers: buildJurisdictionHeaders(input),
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
      headers: buildJurisdictionHeaders(input),
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
      headers: buildJurisdictionHeaders(input),
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
      headers: buildJurisdictionHeaders(input),
    },
    "execute",
  );
  return {
    bucketName,
    deleted: true,
  };
}

function resolveAccountId(input: Record<string, unknown>, context: CloudflareR2Context): string {
  const inputAccountId = optionalString(input.accountId);
  const accountId = context.accountId ?? optionalString(context.metadata.accountId) ?? inputAccountId;
  if (!accountId) {
    throw new ProviderRequestError(
      400,
      Array.isArray(context.metadata.availableAccounts)
        ? "accountId is required for this Cloudflare R2 action because the OAuth credential can access multiple accounts"
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

function buildJurisdictionHeaders(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "cf-r2-jurisdiction": optionalString(input.jurisdiction),
  };
}

async function requestEnvelope(
  context: CloudflareR2Context,
  request: CloudflareR2RequestInput,
  phase: "validate" | "execute",
): Promise<CloudflareR2Envelope> {
  return cloudflareR2RequestEnvelope(context.accessToken, request, context, phase);
}

async function cloudflareR2RequestEnvelope(
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

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed ${label} response`);
  }
  return record;
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
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

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => typeof item === "string");
}
