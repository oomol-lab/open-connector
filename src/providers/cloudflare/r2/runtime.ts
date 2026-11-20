import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareEnvelope } from "../shared/client.ts";
import type { CloudflareContext } from "../shared/context.ts";
import type { CloudflareR2RequestInput } from "./client.ts";
import type { CloudflareR2PresignedMethod } from "./s3-presign.ts";

import { encodeS3ObjectKey } from "../../../core/aws-sigv4.ts";
import {
  base64Bytes,
  compactObject,
  integer,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes, storeResponseInTransit } from "../../../core/request.ts";
import {
  providerFetch,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  runProviderRequest,
  providerResponseError,
} from "../../provider-runtime.ts";
import { readCloudflareEnvelope } from "../shared/client.ts";
import { withAccount, resolveAccountId } from "../shared/context.ts";
import { cloudflareResponseError } from "../shared/errors.ts";
import {
  readObject,
  buildR2JurisdictionHeaders,
  readObjectKey,
  buildCloudflareR2Url,
  resolveR2S3AccessKeyId,
  requestEnvelope as requestR2Envelope,
  readRequiredString,
  readOptionalStringArray,
} from "./client.ts";
import { handlers as r2AccountHandlers } from "./runtime-account.ts";
import { handlers as r2BucketSettingsHandlers } from "./runtime-bucket-settings.ts";
import { handlers as r2DomainHandlers } from "./runtime-domains.ts";
import { handlers as r2EventNotificationHandlers } from "./runtime-event-notifications.ts";
import { handlers as r2ObjectHandlers } from "./runtime-objects.ts";
import { createCloudflareR2PresignedUrl, deriveCloudflareR2S3SecretAccessKey } from "./s3-presign.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  ...r2ObjectHandlers,
  ...r2DomainHandlers,
  ...r2BucketSettingsHandlers,
  ...r2EventNotificationHandlers,
  ...r2AccountHandlers,

  list_buckets: withAccount(listBuckets),
  get_bucket: withAccount(getBucket),
  download_object: withAccount(downloadObject),
  create_bucket: withAccount(createBucket),
  update_bucket: withAccount(updateBucket),
  delete_bucket: withAccount(deleteBucket),
  get_bucket_cors_policy: withAccount(getBucketCorsPolicy),
  update_bucket_cors_policy: withAccount(updateBucketCorsPolicy),
  delete_bucket_cors_policy: withAccount(deleteBucketCorsPolicy),
  put_object: withAccount(putObject),
  generate_presigned_url: withAccount(generatePresignedUrl),
};

async function listBuckets(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function getBucket(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function downloadObject(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "cloudflare download_object requires local transit file storage");
  }

  const accountId = resolveAccountId(input, context);
  const bucketName = requiredString(input.bucketName, "bucketName", providerInputError);
  const objectKey = readObjectKey(input);
  const url = buildCloudflareR2Url(
    `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeS3ObjectKey(objectKey)}`,
  );
  const headers: Record<string, string> = {
    "accept": "*/*",
    ...context.authHeaders,
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
    const envelope = await readCloudflareEnvelope(response);
    throw cloudflareResponseError(response, envelope, "execute");
  }

  const name = optionalString(input.fileName) ?? defaultObjectFileName(objectKey);
  const mimeType = optionalString(response.headers.get("content-type")) ?? "application/octet-stream";
  const file = await storeResponseInTransit(response, context.transitFiles, {
    name,
    mimeType,
    fieldName: "Cloudflare R2 download",
    createError: (message) => new ProviderRequestError(413, message),
    signal: context.signal,
  });

  return {
    fileId: objectKey,
    name,
    mimeType,
    sizeBytes: file.sizeBytes,
    file,
  };
}

async function createBucket(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function updateBucket(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function deleteBucket(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function getBucketCorsPolicy(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function updateBucketCorsPolicy(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function deleteBucketCorsPolicy(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

async function putObject(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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
      `/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeS3ObjectKey(objectKey)}`,
    ),
    {
      method: "PUT",
      headers: compactObject({
        "accept": "application/json",
        ...context.authHeaders,
        "user-agent": providerUserAgent,
        ...headers,
      }),
      body,
      signal: context.signal,
    },
  );
  const envelope = await readCloudflareEnvelope(response);
  if (!response.ok || envelope.success === false) {
    throw cloudflareResponseError(response, envelope, "execute");
  }
  const resultRecord = optionalRecord(envelope.result);
  return {
    bucketName,
    objectKey,
    etag: normalizeEtag(optionalString(resultRecord?.etag) ?? optionalString(response.headers.get("etag"))),
  };
}

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
      throw response.status >= 500 ? providerResponseError(message) : providerInputError(message);
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

async function generatePresignedUrl(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
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

function defaultObjectFileName(objectKey: string): string {
  return objectKey.split("/").findLast((segment) => segment.length > 0) ?? "r2-object";
}

async function requestEnvelope(
  context: CloudflareContext,
  request: CloudflareR2RequestInput,
  phase: "validate" | "execute",
): Promise<CloudflareEnvelope> {
  return requestR2Envelope(context.authHeaders, request, context, phase);
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

function readRequiredStringArray(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `malformed cloudflare r2 response: missing ${field}`);
  }
  return value.map((item) => String(item));
}
