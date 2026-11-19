import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import {
  looseArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  compactObject,
  optionalBoolean,
} from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";
import {
  buildCloudflareR2BucketPath,
  buildR2JurisdictionHeaders,
  requestEnvelope,
  encodeR2ObjectKeyPath,
  readObject,
  readObjectArray,
  readOptionalStringArray,
  readRequiredString,
  requireObjectKey,
} from "./client.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  list_objects: listObjects,
  delete_object: deleteObject,
  delete_objects: deleteObjects,
  delete_objects_by_prefix: deleteObjectsByPrefix,
  list_bucket_jobs: listBucketJobs,
  get_bucket_job: getBucketJob,
};

async function listObjects(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/objects`,
      query: compactObject({
        prefix: optionalString(input.prefix),
        delimiter: optionalString(input.delimiter),
        start_after: optionalString(input.startAfter),
        cursor: optionalString(input.cursor),
        per_page: optionalInteger(input.perPage),
      }),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const resultInfo = optionalRecord(envelope.result_info);

  return compactObject({
    objects: readObjectArray(envelope.result, "cloudflare r2 object list").map(normalizeR2Object),
    commonPrefixes: readOptionalStringArray(resultInfo?.delimited) ?? [],
    isTruncated: optionalBoolean(resultInfo?.is_truncated) ?? false,
    cursor: optionalString(resultInfo?.cursor),
  });
}

async function deleteObject(input: Record<string, unknown>, context: CloudflareContext) {
  const bucketName = String(input.bucketName);
  const objectKey = requireObjectKey(input.objectKey);
  await requestEnvelope(
    context.accessToken,
    {
      method: "DELETE",
      path: `${buildCloudflareR2BucketPath(input, context)}/objects/${encodeR2ObjectKeyPath(objectKey)}`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return { bucketName, objectKey, deleted: true };
}

async function deleteObjects(input: Record<string, unknown>, context: CloudflareContext) {
  const bucketName = String(input.bucketName);
  const objectKeys = looseArray(input.objectKeys).map((key) => requireObjectKey(key));
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      method: "DELETE",
      path: `${buildCloudflareR2BucketPath(input, context)}/objects`,
      body: objectKeys,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return {
    bucketName,
    results: readObjectArray(envelope.result, "cloudflare r2 delete objects"),
  };
}

async function deleteObjectsByPrefix(input: Record<string, unknown>, context: CloudflareContext) {
  const prefix = optionalString(input.prefix);
  const emptyBucket = optionalBoolean(input.emptyBucket) === true;
  if ((prefix !== undefined) === emptyBucket) {
    throw new ProviderRequestError(400, "exactly one of prefix or emptyBucket=true is required");
  }
  if (prefix !== undefined && !prefix.endsWith("/")) {
    throw new ProviderRequestError(400, "prefix must end with /");
  }
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      method: "DELETE",
      path: `${buildCloudflareR2BucketPath(input, context)}/objects`,
      query: { prefix: prefix ?? "" },
      headers: {
        ...buildR2JurisdictionHeaders(input),
        "cf-r2-data-catalog-check": optionalBoolean(input.rejectWhenDataCatalogEnabled) === true ? "true" : undefined,
      },
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2BucketJob(envelope.result);
}

async function listBucketJobs(input: Record<string, unknown>, context: CloudflareContext) {
  if (input.status !== undefined && input.jobType === undefined) {
    throw new ProviderRequestError(400, "jobType is required when status is set");
  }
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/jobs`,
      query: compactObject({
        jobType: optionalString(input.jobType),
        status: optionalString(input.status),
        maxKeys: optionalInteger(input.maxKeys),
        continuationToken: optionalString(input.continuationToken),
      }),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const result = readObject(envelope.result, "cloudflare r2 bucket job list");

  return compactObject({
    jobs: readObjectArray(result.jobs, "cloudflare r2 bucket job list").map(normalizeR2BucketJob),
    nextContinuationToken: optionalString(result.nextContinuationToken),
  });
}

async function getBucketJob(input: Record<string, unknown>, context: CloudflareContext) {
  const jobId = String(input.jobId);
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/jobs/${encodeURIComponent(jobId)}`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2BucketJob(envelope.result);
}

function normalizeR2Object(object: Record<string, unknown>) {
  const httpMetadata = optionalRecord(object.http_metadata);
  const customMetadata = optionalRecord(object.custom_metadata);

  return compactObject({
    key: readRequiredString(object, "key"),
    size: optionalInteger(object.size),
    etag: optionalString(object.etag),
    lastModified: optionalString(object.last_modified),
    storageClass: optionalString(object.storage_class),
    ssec: optionalBoolean(object.ssec),
    httpMetadata: httpMetadata
      ? compactObject({
          contentType: optionalString(httpMetadata.contentType),
          contentLanguage: optionalString(httpMetadata.contentLanguage),
          contentDisposition: optionalString(httpMetadata.contentDisposition),
          contentEncoding: optionalString(httpMetadata.contentEncoding),
          cacheControl: optionalString(httpMetadata.cacheControl),
          cacheExpiry: optionalString(httpMetadata.cacheExpiry),
        })
      : undefined,
    customMetadata: customMetadata
      ? Object.fromEntries(
          Object.entries(customMetadata).flatMap(([key, value]) => {
            const text = optionalString(value);
            return text === undefined ? [] : [[key, text] as const];
          }),
        )
      : undefined,
  });
}

function normalizeR2BucketJob(value: unknown): Record<string, unknown> {
  const job = readObject(value, "cloudflare r2 bucket job");
  const prefixDelete = optionalRecord(job.prefixDelete);

  return compactObject({
    jobId: readRequiredString(job, "id"),
    jobType: readRequiredString(job, "jobType"),
    status: readRequiredString(job, "status"),
    startTime: optionalString(job.startTime),
    endTime: optionalString(job.endTime),
    prefix: optionalString(prefixDelete?.prefix),
    deletedObjects: optionalInteger(prefixDelete?.deletedObjects),
    isBucketClear: optionalBoolean(prefixDelete?.isBucketClear),
  });
}
