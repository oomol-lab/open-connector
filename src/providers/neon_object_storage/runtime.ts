import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  base64Bytes,
  compactObject,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRawString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, encodePathSegment, storeResponseInTransit } from "../../core/request.ts";
import { normalizeNeonArray, normalizeNeonObject, requestNeonJson } from "../neon/runtime.ts";
import { downloadUploadSource, readTransitFileInput } from "../provider-files.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  readProviderErrorTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

type NeonPresignOperation = "upload" | "download";

interface NeonPresignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
}

interface NeonPresignInput {
  path: string;
  operation: NeonPresignOperation;
  contentType?: string;
  expiresInSeconds?: number;
}

interface NeonUploadContent {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

export const neonObjectStorageActionHandlers: ProviderActionHandlers<
  "neon_object_storage",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  get_branch_storage(input, context) {
    return getBranchStorage(input, context);
  },
  list_buckets(input, context) {
    return listBuckets(input, context);
  },
  create_bucket(input, context) {
    return createBucket(input, context);
  },
  delete_bucket(input, context) {
    return deleteBucket(input, context);
  },
  list_objects(input, context) {
    return listObjects(input, context);
  },
  download_object(input, context) {
    return downloadObject(input, context);
  },
  put_object(input, context) {
    return putObject(input, context);
  },
  delete_object(input, context) {
    return deleteObject(input, context);
  },
  delete_objects_by_prefix(input, context) {
    return deleteObjectsByPrefix(input, context);
  },
  generate_presigned_url(input, context) {
    return generatePresignedUrl(input, context);
  },
};

async function getBranchStorage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = requiredResponseRecord(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `${branchPath(input)}/storage`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "Neon branch storage response",
  );

  return {
    enabled: payload.enabled === true,
    s3Endpoint: requiredString(payload.s3_endpoint, "s3_endpoint", providerResponseError),
    region: requiredString(payload.region, "region", providerResponseError),
    forcePathStyle: payload.force_path_style !== false,
  };
}

async function listBuckets(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = requiredResponseRecord(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `${branchPath(input)}/buckets`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
    }),
    "Neon bucket list response",
  );

  return {
    buckets: normalizeNeonArray(payload.buckets, "buckets"),
  };
}

async function createBucket(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = requiredResponseRecord(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `${branchPath(input)}/buckets`,
      method: "POST",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: compactObject({
        name: requiredInputString(input.name, "name"),
        access_level: optionalString(input.accessLevel),
      }),
    }),
    "Neon create bucket response",
  );

  return {
    bucket: normalizeNeonObject(payload.bucket, "bucket"),
  };
}

async function deleteBucket(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const bucketName = requiredInputString(input.bucketName, "bucketName");
  await requestNeonJson({
    apiKey: context.apiKey,
    path: bucketPath(input, bucketName),
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
    allowNoContent: true,
  });

  return { deleted: true, bucketName };
}

async function listObjects(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const bucketName = requiredInputString(input.bucketName, "bucketName");
  const payload = requiredResponseRecord(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `${bucketPath(input, bucketName)}/objects`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: {
        prefix: optionalRawString(input.prefix),
        delimiter: optionalString(input.delimiter),
        cursor: optionalRawString(input.cursor),
        limit: optionalNumber(input.limit),
      },
    }),
    "Neon object list response",
  );

  return {
    objects: normalizeNeonArray(payload.objects, "objects"),
    folders: Array.isArray(payload.folders) ? payload.folders.map((folder) => String(folder)) : [],
    prefix: optionalRawString(payload.prefix) ?? "",
    // Neon uses the last listed key as the cursor, so it keeps the key's whitespace.
    nextCursor: optionalRawString(payload.next_cursor) || null,
    isTruncated: payload.is_truncated === true,
  };
}

async function downloadObject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  if (!context.transitFiles) {
    throw providerInputError("neon_object_storage download_object requires local transit file storage");
  }
  const transitFiles = context.transitFiles;
  const bucketName = requiredInputString(input.bucketName, "bucketName");
  const objectKey = requiredRawString(input.objectKey, "objectKey", providerInputError);
  // The API download endpoint always answers application/octet-stream, so read
  // through a presigned GET, which returns the Content-Type stored on the object.
  const presigned = await presignObject(context, {
    path: objectPath(input, bucketName, objectKey),
    operation: "download",
  });

  return runProviderRequest({ label: "Neon Object Storage download", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(presigned.url, {
      method: presigned.method,
      headers: presigned.headers,
      signal,
    });
    if (!response.ok) {
      throw await storageResponseError(response, objectKey, signal);
    }

    const name = optionalString(input.fileName) ?? defaultObjectFileName(objectKey);
    const mimeType = optionalString(response.headers.get("content-type")) ?? "application/octet-stream";
    const file = await storeResponseInTransit(response, transitFiles, {
      name,
      mimeType,
      fieldName: "Neon Object Storage download",
      createError: (message) => new ProviderRequestError(413, message),
      signal,
    });

    return {
      bucketName,
      objectKey,
      name,
      mimeType,
      sizeBytes: file.sizeBytes,
      file,
    };
  });
}

async function putObject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const bucketName = requiredInputString(input.bucketName, "bucketName");
  const objectKey = requiredRawString(input.objectKey, "objectKey", providerInputError);
  const content = await readUploadContent(input, context);
  const presigned = await presignObject(context, {
    path: objectPath(input, bucketName, objectKey),
    operation: "upload",
    contentType: content.contentType,
  });

  return runProviderRequest({ label: "Neon Object Storage upload", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(presigned.url, {
      method: presigned.method,
      headers: presigned.headers,
      body: content.bytes,
      signal,
    });
    if (!response.ok) {
      throw await storageResponseError(response, objectKey, signal);
    }
    void response.body?.cancel().catch(() => undefined);

    return {
      bucketName,
      objectKey,
      contentType: content.contentType,
      sizeBytes: content.bytes.byteLength,
      etag: unquoteEtag(response.headers.get("etag")),
    };
  });
}

async function deleteObject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const bucketName = requiredInputString(input.bucketName, "bucketName");
  const objectKey = requiredRawString(input.objectKey, "objectKey", providerInputError);
  await requestNeonJson({
    apiKey: context.apiKey,
    path: objectPath(input, bucketName, objectKey),
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
    allowNoContent: true,
  });

  return { deleted: true, bucketName, objectKey };
}

async function deleteObjectsByPrefix(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const bucketName = requiredInputString(input.bucketName, "bucketName");
  const prefix = requiredRawString(input.prefix, "prefix", providerInputError);
  if (!prefix.endsWith("/")) {
    throw providerInputError("prefix must end with /");
  }
  const payload = requiredResponseRecord(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `${bucketPath(input, bucketName)}/objects-by-prefix`,
      method: "DELETE",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: { prefix },
    }),
    "Neon delete objects by prefix response",
  );

  return {
    bucketName,
    prefix,
    deletedCount: optionalNumber(payload.deleted) ?? 0,
  };
}

async function generatePresignedUrl(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const bucketName = requiredInputString(input.bucketName, "bucketName");
  const objectKey = requiredRawString(input.objectKey, "objectKey", providerInputError);
  const operation = input.operation === "upload" ? "upload" : "download";
  const presigned = await presignObject(context, {
    path: objectPath(input, bucketName, objectKey),
    operation,
    contentType: operation === "upload" ? optionalString(input.contentType) : undefined,
    expiresInSeconds: optionalNumber(input.expiresInSeconds),
  });

  return {
    bucketName,
    objectKey,
    method: presigned.method,
    url: presigned.url,
    requiredHeaders: presigned.headers,
    expiresAt: presigned.expiresAt,
  };
}

async function presignObject(context: ApiKeyProviderContext, input: NeonPresignInput): Promise<NeonPresignedRequest> {
  const payload = requiredResponseRecord(
    await requestNeonJson({
      apiKey: context.apiKey,
      path: `${input.path}/presign`,
      method: "POST",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: compactObject({
        operation: input.operation,
        content_type: input.contentType,
        expires_in_seconds: input.expiresInSeconds,
      }),
    }),
    "Neon presign response",
  );

  // Header names are sent back verbatim, so they bypass the camelCase normalizer.
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(optionalRecord(payload.headers) ?? {})) {
    if (typeof value === "string") {
      headers[name] = value;
    }
  }

  return {
    url: requiredString(payload.url, "url", providerResponseError),
    method: requiredString(payload.method, "method", providerResponseError),
    headers,
    expiresAt: requiredString(payload.expires_at, "expires_at", providerResponseError),
  };
}

async function readUploadContent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<NeonUploadContent> {
  const explicitType = optionalString(input.contentType);
  if (input.file != null) {
    const file = await readTransitFileInput(input.file, context);
    return {
      bytes: new Uint8Array(await file.file.arrayBuffer()),
      contentType: explicitType ?? (file.mimeType || "application/octet-stream"),
    };
  }
  if (input.sourceUrl != null) {
    const sourceUrl = assertPublicHttpUrl(requiredInputString(input.sourceUrl, "sourceUrl"), {
      fieldName: "sourceUrl",
      createError: providerInputError,
    });
    const source = await downloadUploadSource({
      url: sourceUrl.toString(),
      fieldName: "sourceUrl",
      fetcher: context.fetcher,
      signal: context.signal,
    });
    return {
      bytes: Uint8Array.from(source.bytes),
      contentType: explicitType ?? source.contentType ?? "application/octet-stream",
    };
  }
  if (input.contentBase64 != null) {
    return {
      bytes: base64Bytes(input.contentBase64, "contentBase64", providerInputError),
      contentType: explicitType ?? "application/octet-stream",
    };
  }
  if (typeof input.contentText === "string") {
    return {
      bytes: new Uint8Array(Buffer.from(input.contentText, "utf8")),
      contentType: explicitType ?? "text/plain; charset=utf-8",
    };
  }
  throw providerInputError("Provide exactly one of file, sourceUrl, contentText, or contentBase64");
}

async function storageResponseError(
  response: Response,
  objectKey: string,
  signal?: AbortSignal,
): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, "Neon Object Storage error response", signal);
  if (response.status === 404) {
    return providerInputError(`Neon object not found: ${objectKey}`);
  }
  return providerResponseError(
    `Neon Object Storage request failed with HTTP ${response.status}${text ? `: ${text.trim()}` : ""}`,
  );
}

function branchPath(input: Record<string, unknown>): string {
  const projectId = requiredInputString(input.projectId, "projectId");
  const branchId = requiredInputString(input.branchId, "branchId");
  return `/projects/${encodeStoragePathSegment(projectId, "projectId")}/branches/${encodeStoragePathSegment(branchId, "branchId")}`;
}

function bucketPath(input: Record<string, unknown>, bucketName: string): string {
  return `${branchPath(input)}/buckets/${encodeStoragePathSegment(bucketName, "bucketName")}`;
}

// The Neon API matches the whole key as one path segment, so slashes inside the
// key must travel as %2F rather than as literal path separators.
function objectPath(input: Record<string, unknown>, bucketName: string, objectKey: string): string {
  return `${bucketPath(input, bucketName)}/objects/${encodeStoragePathSegment(objectKey, "objectKey")}`;
}

function defaultObjectFileName(objectKey: string): string {
  return objectKey.split("/").findLast((segment) => segment.length > 0) ?? "neon-object";
}

function unquoteEtag(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function encodeStoragePathSegment(value: string, fieldName: string): string {
  // URL parsing resolves dot segments even when the dots are percent-encoded.
  if (!value || value === "." || value === "..") {
    throw providerInputError(`${fieldName} must be non-empty and must not be . or ..`);
  }
  return encodePathSegment(value);
}
