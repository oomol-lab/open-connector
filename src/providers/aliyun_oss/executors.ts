import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AliyunOssActionName } from "./actions.ts";

import AliOss from "ali-oss";
import { isIP } from "node:net";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "aliyun_oss";
const sourceFetchTimeoutMs = 15_000;
const maxSourceBytes = 20 * 1024 * 1024;

type AliyunBucket = {
  name?: string;
  region?: string;
  creationDate?: string;
  storageClass?: string | null;
  StorageClass?: string | null;
};

type AliyunOwner = {
  id?: string;
  displayName?: string;
} | null;

type AliyunObject = {
  name?: string;
  url?: string;
  lastModified?: string;
  etag?: string;
  type?: string;
  size?: number;
  storageClass?: string | null;
  owner?: AliyunOwner;
};

interface AliyunListBucketsResult {
  buckets?: AliyunBucket[] | null;
  owner?: AliyunOwner;
  isTruncated?: boolean;
  nextMarker?: string | null;
}

interface AliyunListObjectsResult {
  objects?: AliyunObject[] | null;
  prefixes?: string[] | null;
  isTruncated?: boolean;
  keyCount?: number;
  continuationToken?: string | null;
  nextContinuationToken?: string | null;
}

interface AliyunPutResult {
  name?: string;
  url?: string;
  res?: {
    headers?: Record<string, string | undefined>;
  };
}

interface AliyunGetObjectMetaResult {
  res?: {
    headers?: Record<string, string | undefined>;
  };
}

interface AliyunOssClient {
  listBuckets(query?: Record<string, unknown> | null): Promise<AliyunListBucketsResult>;
  listV2(query?: Record<string, unknown> | null): Promise<AliyunListObjectsResult>;
  put(name: string, body: string | Buffer, options?: Record<string, unknown>): Promise<AliyunPutResult>;
  delete(name: string, options?: Record<string, unknown>): Promise<unknown>;
  authorization(
    method: string,
    resource: string,
    subres: Record<string, string>,
    headers: Record<string, string>,
  ): string;
  signatureUrl(
    name: string,
    options?: {
      expires?: number;
      method?: "GET" | "PUT" | "DELETE";
      "Content-Type"?: string;
    },
  ): string;
  getObjectMeta(name: string, options?: Record<string, unknown>): Promise<AliyunGetObjectMetaResult>;
}

interface AliyunClientOptions {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
  endpoint: string;
  bucket?: string;
}

interface AliyunOssContext {
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AliyunOssActionHandler = (input: Record<string, unknown>, context: AliyunOssContext) => Promise<unknown>;

const aliyunOssProxySignedQueryParameters = new Set([
  "acl",
  "append",
  "bucketInfo",
  "callback",
  "callback-var",
  "cname",
  "comp",
  "continuation-token",
  "cors",
  "delete",
  "encryption",
  "endTime",
  "img",
  "inventory",
  "inventoryId",
  "lifecycle",
  "live",
  "location",
  "logging",
  "objectMeta",
  "partNumber",
  "policy",
  "position",
  "qos",
  "referer",
  "replication",
  "replicationLocation",
  "replicationProgress",
  "requestPayment",
  "response-cache-control",
  "response-content-disposition",
  "response-content-encoding",
  "response-content-language",
  "response-content-type",
  "response-expires",
  "restore",
  "security-token",
  "sequential",
  "startTime",
  "status",
  "style",
  "styleName",
  "symlink",
  "tagging",
  "uploadId",
  "uploads",
  "versionId",
  "versioning",
  "vod",
  "website",
  "worm",
  "wormExtend",
  "wormId",
  "x-oss-process",
  "x-oss-traffic-limit",
]);

export const aliyunOssActionHandlers: Record<AliyunOssActionName, AliyunOssActionHandler> = {
  list_buckets(input, context) {
    return aliyunListBuckets(input, context);
  },
  list_objects(input, context) {
    return aliyunListObjects(input, context);
  },
  head_object(input, context) {
    return aliyunHeadObject(input, context);
  },
  put_object(input, context) {
    return aliyunPutObject(input, context);
  },
  delete_object(input, context) {
    return aliyunDeleteObject(input, context);
  },
  generate_presigned_url(input, context) {
    return aliyunGeneratePresignedUrl(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AliyunOssContext>({
  service,
  handlers: aliyunOssActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AliyunOssContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure aliyun_oss custom credentials first.");
    }
    return {
      values: credential.values,
      metadata: credential.metadata,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure aliyun_oss custom credentials first.");
    }

    const endpoint = requireAliyunField(credential.metadata.endpoint ?? credential.values.endpoint, "endpoint");
    const bucket = optionalString(credential.metadata.bucket) ?? optionalString(credential.values.bucket);
    const securityToken = optionalString(credential.values.securityToken);
    const url = createProviderProxyUrl(buildAliyunOssProxyBaseUrl(endpoint, bucket), input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    headers.set("x-oss-date", new Date().toUTCString());
    if (securityToken) {
      headers.set("x-oss-security-token", securityToken);
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const client = createAliyunOssClient({
      accessKeyId: requireAliyunField(credential.values.accessKeyId, "accessKeyId"),
      accessKeySecret: requireAliyunField(credential.values.accessKeySecret, "accessKeySecret"),
      endpoint,
    });
    headers.set(
      "authorization",
      client.authorization(
        input.method,
        buildAliyunOssProxyResource(url, bucket),
        buildAliyunOssProxySubres(url),
        Object.fromEntries(headers.entries()),
      ),
    );

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `Alibaba Cloud OSS request failed with HTTP ${response.status}`,
      );
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Alibaba Cloud OSS request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input): Promise<CredentialValidationResult> {
    return validateAliyunOssCredential(input.values);
  },
};

async function validateAliyunOssCredential(input: Record<string, string>): Promise<CredentialValidationResult> {
  const accessKeyId = requireAliyunField(input.accessKeyId, "accessKeyId");
  const accessKeySecret = requireAliyunField(input.accessKeySecret, "accessKeySecret");
  const endpoint = normalizeEndpoint(requireAliyunField(input.endpoint, "endpoint"));
  const bucket = optionalString(input.bucket);
  const securityToken = optionalString(input.securityToken);

  try {
    const client = createAliyunOssClient({
      accessKeyId,
      accessKeySecret,
      securityToken,
      endpoint,
    });
    const result = await client.listBuckets({ "max-keys": 1 });
    const firstBucket = normalizeBucket(result.buckets?.[0]);

    return {
      profile: {
        accountId: accessKeyId,
        displayName: firstBucket?.name
          ? `Alibaba Cloud OSS - ${firstBucket.name}`
          : `Alibaba Cloud OSS - ${stripProtocol(endpoint)}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        endpoint,
        bucket,
        credentialKind: securityToken ? "sts" : "aksk",
        firstBucketName: firstBucket?.name,
      }),
    };
  } catch (error) {
    throw normalizeAliyunError(error, "validate");
  }
}

function createAliyunOssClient(input: AliyunClientOptions): AliyunOssClient {
  return new AliOss({
    accessKeyId: input.accessKeyId,
    accessKeySecret: input.accessKeySecret,
    ...(input.securityToken ? { stsToken: input.securityToken } : {}),
    endpoint: stripProtocol(normalizeEndpoint(input.endpoint)),
    ...(input.bucket ? { bucket: input.bucket } : {}),
    secure: true,
  }) as unknown as AliyunOssClient;
}

function buildAliyunOssProxyBaseUrl(endpoint: string, bucket: string | undefined): string {
  const endpointUrl = new URL(normalizeEndpoint(endpoint));
  return bucket ? `https://${bucket}.${endpointUrl.host}` : endpointUrl.toString();
}

function buildAliyunOssProxyResource(url: URL, bucket: string | undefined): string {
  return bucket ? `/${bucket}${url.pathname}` : url.pathname;
}

function buildAliyunOssProxySubres(url: URL): Record<string, string> {
  const subres: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (aliyunOssProxySignedQueryParameters.has(key)) {
      subres[key] = value;
    }
  }
  return subres;
}

async function aliyunListBuckets(input: Record<string, unknown>, context: AliyunOssContext): Promise<unknown> {
  const client = createClientForAction(input, context);
  const result = await client.listBuckets(
    compactObject({
      prefix: optionalString(input.prefix),
      marker: optionalString(input.marker),
      "max-keys": optionalPositiveInteger(input.maxKeys),
    }),
  );

  return {
    buckets: (result.buckets ?? []).map((bucket) => normalizeBucket(bucket)),
    owner: normalizeOwner(result.owner),
    isTruncated: result.isTruncated === true,
    nextMarker: result.nextMarker ?? null,
  };
}

async function aliyunListObjects(input: Record<string, unknown>, context: AliyunOssContext): Promise<unknown> {
  const bucket = requireAliyunField(input.bucket, "bucket");
  const client = createClientForAction(input, context, bucket);
  const result = await client.listV2(
    compactObject({
      prefix: optionalString(input.prefix),
      delimiter: optionalString(input.delimiter),
      "continuation-token": optionalString(input.continuationToken),
      "start-after": optionalString(input.startAfter),
      "fetch-owner": input.fetchOwner === true ? true : undefined,
      "max-keys": optionalPositiveInteger(input.maxKeys),
    }),
  );

  return {
    objects: (result.objects ?? []).map((object) => normalizeObject(object)),
    prefixes: result.prefixes ?? [],
    isTruncated: result.isTruncated === true,
    keyCount: Number(result.keyCount ?? 0),
    continuationToken: result.continuationToken ?? null,
    nextContinuationToken: result.nextContinuationToken ?? null,
  };
}

async function aliyunHeadObject(input: Record<string, unknown>, context: AliyunOssContext): Promise<unknown> {
  const bucket = resolveBucket(input, context);
  const objectKey = requireAliyunField(input.objectKey, "objectKey");
  const client = createClientForAction(input, context, bucket);
  const result = await client.getObjectMeta(
    objectKey,
    compactObject({
      versionId: optionalString(input.versionId),
    }),
  );

  const headers = normalizeHeaderRecord(result.res?.headers);
  return {
    object: {
      bucket,
      objectKey,
      etag: headers.etag ?? null,
      contentLength: parseHeaderInteger(headers["content-length"]),
      contentType: headers["content-type"] ?? null,
      lastModified: headers["last-modified"] ?? null,
      cacheControl: headers["cache-control"] ?? null,
      contentDisposition: headers["content-disposition"] ?? null,
      contentEncoding: headers["content-encoding"] ?? null,
      storageClass: headers["x-oss-storage-class"] ?? null,
      versionId: headers["x-oss-version-id"] ?? null,
      metadata: extractAliyunMetadata(headers),
      headers,
    },
  };
}

async function aliyunPutObject(input: Record<string, unknown>, context: AliyunOssContext): Promise<unknown> {
  const bucket = resolveBucket(input, context);
  const objectKey = requireAliyunField(input.objectKey, "objectKey");
  const client = createClientForAction(input, context, bucket);
  const sourceUrl = optionalString(input.sourceUrl);
  const sourceFile = sourceUrl ? await downloadSourceFile(sourceUrl, context.fetcher, context.signal) : null;
  const resolvedContentType = optionalString(input.contentType) ?? sourceFile?.contentType;
  const body =
    sourceFile?.bytes ??
    (optionalString(input.contentBase64) != null
      ? Buffer.from(String(input.contentBase64), "base64")
      : String(input.contentText ?? ""));
  const result = await client.put(objectKey, body, {
    mime: resolvedContentType,
    meta: normalizeMetadataInput(optionalRecord(input.metadata)),
    headers: compactObject({
      "Cache-Control": optionalString(input.cacheControl),
      "Content-Disposition": optionalString(input.contentDisposition),
    }),
  });
  const headers = normalizeHeaderRecord(result.res?.headers);

  return {
    bucket,
    objectKey: result.name ?? objectKey,
    url: result.url ?? buildFallbackObjectUrl(resolveEndpoint(input, context), bucket, objectKey),
    etag: headers.etag ?? null,
  };
}

async function downloadSourceFile(
  sourceUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<{ bytes: Buffer; contentType?: string }> {
  const validatedSourceUrl = validateSourceUrl(sourceUrl);
  const timeoutSignal = AbortSignal.timeout(sourceFetchTimeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetcher(validatedSourceUrl, {
    signal: requestSignal,
  });
  const contentLength = parseHeaderInteger(response.headers.get("content-length") ?? undefined);
  if (contentLength != null && contentLength > maxSourceBytes) {
    throw new ProviderRequestError(400, "sourceUrl payload is too large");
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status,
      `failed to download sourceUrl: ${response.status} ${response.statusText}`.trim(),
    );
  }

  return {
    bytes: await readResponseBytesWithLimit(response, maxSourceBytes),
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

async function aliyunDeleteObject(input: Record<string, unknown>, context: AliyunOssContext): Promise<unknown> {
  const bucket = resolveBucket(input, context);
  const objectKey = requireAliyunField(input.objectKey, "objectKey");
  const client = createClientForAction(input, context, bucket);

  await client.delete(
    objectKey,
    compactObject({
      versionId: optionalString(input.versionId),
    }),
  );

  return {
    bucket,
    objectKey,
    deleted: true,
  };
}

async function aliyunGeneratePresignedUrl(input: Record<string, unknown>, context: AliyunOssContext): Promise<unknown> {
  const bucket = resolveBucket(input, context);
  const objectKey = requireAliyunField(input.objectKey, "objectKey");
  const client = createClientForAction(input, context, bucket);
  const method = normalizePresignedMethod(input.method);
  const expiresSeconds = normalizeExpiresSeconds(input.expiresSeconds);
  const url = client.signatureUrl(
    objectKey,
    compactObject({
      expires: expiresSeconds,
      method,
      "Content-Type": optionalString(input.contentType),
    }),
  );

  return {
    bucket,
    objectKey,
    method,
    expiresSeconds,
    url,
  };
}

function createClientForAction(
  input: Record<string, unknown>,
  context: AliyunOssContext,
  bucket?: string,
): AliyunOssClient {
  const endpoint = resolveEndpoint(input, context);
  return createAliyunOssClient({
    accessKeyId: requireAliyunField(context.values.accessKeyId, "accessKeyId"),
    accessKeySecret: requireAliyunField(context.values.accessKeySecret, "accessKeySecret"),
    securityToken: optionalString(context.values.securityToken),
    endpoint,
    bucket,
  });
}

function resolveEndpoint(input: Record<string, unknown>, context: AliyunOssContext): string {
  return (
    optionalString(input.endpoint) ??
    optionalString(context.metadata.endpoint) ??
    optionalString(context.values.endpoint) ??
    missingAliyunField("endpoint is required for aliyun_oss action execution")
  );
}

function resolveBucket(input: Record<string, unknown>, context: AliyunOssContext): string {
  return (
    optionalString(input.bucket) ??
    optionalString(context.metadata.bucket) ??
    optionalString(context.values.bucket) ??
    missingAliyunField("bucket is required")
  );
}

function missingAliyunField(message: string): never {
  throw new ProviderRequestError(400, message);
}

function normalizeBucket(bucket: AliyunBucket | undefined | null): Record<string, unknown> {
  return {
    name: bucket?.name ?? "",
    region: bucket?.region ?? "",
    creationDate: bucket?.creationDate ?? "",
    storageClass: bucket?.storageClass ?? bucket?.StorageClass ?? null,
  };
}

function normalizeObject(object: AliyunObject | undefined | null): Record<string, unknown> {
  return {
    name: object?.name ?? "",
    url: object?.url ?? "",
    lastModified: object?.lastModified ?? "",
    etag: object?.etag ?? "",
    type: object?.type ?? "",
    size: Number(object?.size ?? 0),
    storageClass: object?.storageClass ?? null,
    owner: normalizeOwner(object?.owner ?? null),
  };
}

function normalizeOwner(owner: AliyunOwner | undefined): Record<string, string> | null {
  if (!owner?.id && !owner?.displayName) {
    return null;
  }

  return {
    id: owner.id ?? "",
    displayName: owner.displayName ?? "",
  };
}

function normalizeHeaderRecord(headers: Record<string, string | undefined> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).flatMap(([key, value]) => {
      if (!value) {
        return [];
      }
      return [[key.toLowerCase(), String(value)]];
    }),
  );
}

function extractAliyunMetadata(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (!key.startsWith("x-oss-meta-")) {
        return [];
      }
      return [[key.slice("x-oss-meta-".length), value]];
    }),
  );
}

function normalizeMetadataInput(input: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input ?? {}).flatMap(([key, value]) => {
      const resolved = optionalString(value);
      if (!resolved) {
        return [];
      }
      return [[key, resolved]];
    }),
  );
}

function normalizePresignedMethod(value: unknown): "GET" | "PUT" | "DELETE" {
  return value === "PUT" || value === "DELETE" ? value : "GET";
}

function normalizeExpiresSeconds(value: unknown): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    return 3600;
  }
  return parsed;
}

function parseHeaderInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const parsed = optionalInteger(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function requireAliyunField(value: unknown, name: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${name} is required`);
  }
  return resolved;
}

function normalizeAliyunError(error: unknown, phase: "validate" | "execute"): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const status = readAliyunErrorStatus(error);
  const message = error instanceof Error && error.message.trim() ? error.message : "aliyun_oss request failed";
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status ?? 500, message);
}

function readAliyunErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode ?? record.code;
  return typeof status === "number" ? status : undefined;
}

function normalizeEndpoint(value: string): string {
  const url = parseAndValidateEndpoint(value);
  return `${url.protocol}//${url.host}`;
}

function stripProtocol(value: string): string {
  return parseAndValidateEndpoint(value).host;
}

function buildFallbackObjectUrl(endpoint: string, bucket: string, objectKey: string): string {
  const endpointUrl = new URL(normalizeEndpoint(endpoint));
  const url = new URL(`https://${bucket}.${endpointUrl.host}`);
  url.pathname = `/${objectKey}`;
  return url.toString();
}

function parseAndValidateEndpoint(value: string): URL {
  const url = parseUrl(value.includes("://") ? value : `https://${value}`, "endpoint");
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "endpoint must use https");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new ProviderRequestError(400, "endpoint must not include path, query, or hash");
  }
  validatePublicHostname(url.hostname, "endpoint");
  return url;
}

function validateSourceUrl(value: string): string {
  const url = parseUrl(value, "sourceUrl");
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "sourceUrl must use https");
  }
  validatePublicHostname(url.hostname, "sourceUrl");
  return url.toString();
}

function parseUrl(value: string, fieldName: "endpoint" | "sourceUrl"): URL {
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) {
      throw new ProviderRequestError(400, `${fieldName} must not include credentials`);
    }
    return url;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, `${fieldName} must be a valid URL`);
  }
}

function validatePublicHostname(hostname: string, fieldName: "endpoint" | "sourceUrl"): void {
  const normalizedHostname = hostname.toLowerCase();
  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname.endsWith(".internal") ||
    !normalizedHostname.includes(".") ||
    isIP(normalizedHostname) !== 0
  ) {
    throw new ProviderRequestError(400, `${fieldName} must use a public hostname`);
  }
}

async function readResponseBytesWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    throw new ProviderRequestError(502, "sourceUrl response body is unavailable");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("sourceUrl payload is too large");
        throw new ProviderRequestError(400, "sourceUrl payload is too large");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
