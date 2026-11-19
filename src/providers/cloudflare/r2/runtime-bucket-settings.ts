import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import {
  looseArray,
  recordOrEmpty,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  compactObject,
  optionalBoolean,
} from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";
import { withAccountHandlers } from "../shared/context.ts";
import {
  buildCloudflareR2BucketPath,
  buildR2JurisdictionHeaders,
  requestEnvelope,
  readObject,
  readObjectArray,
  resolveCloudflareR2AccessKeyId,
} from "./client.ts";
import { deriveCloudflareR2S3SecretAccessKey } from "./s3-presign.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = withAccountHandlers({
  get_bucket_lifecycle: getBucketLifecycle,
  update_bucket_lifecycle: updateBucketLifecycle,
  get_bucket_lock: getBucketLock,
  update_bucket_lock: updateBucketLock,
  get_bucket_local_uploads: getBucketLocalUploads,
  update_bucket_local_uploads: updateBucketLocalUploads,
  get_sippy_config: getSippyConfig,
  enable_sippy: enableSippy,
  disable_sippy: disableSippy,
});

async function readBucketRules(
  input: Record<string, unknown>,
  context: CloudflareContext,
  subresource: "lifecycle" | "lock",
) {
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/${subresource}`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const result = readObject(envelope.result, `cloudflare r2 bucket ${subresource}`);

  return { rules: readObjectArray(result.rules, `cloudflare r2 bucket ${subresource}`) };
}

async function writeBucketRules(
  input: Record<string, unknown>,
  context: CloudflareContext,
  subresource: "lifecycle" | "lock",
) {
  const bucketName = String(input.bucketName);
  await requestEnvelope(
    context.accessToken,
    {
      method: "PUT",
      path: `${buildCloudflareR2BucketPath(input, context)}/${subresource}`,
      body: { rules: looseArray(input.rules) },
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return { bucketName, updated: true };
}

function getBucketLifecycle(input: Record<string, unknown>, context: CloudflareContext) {
  return readBucketRules(input, context, "lifecycle");
}

function updateBucketLifecycle(input: Record<string, unknown>, context: CloudflareContext) {
  return writeBucketRules(input, context, "lifecycle");
}

function getBucketLock(input: Record<string, unknown>, context: CloudflareContext) {
  return readBucketRules(input, context, "lock");
}

function updateBucketLock(input: Record<string, unknown>, context: CloudflareContext) {
  return writeBucketRules(input, context, "lock");
}

async function getBucketLocalUploads(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.accessToken,
    { path: `${buildCloudflareR2BucketPath(input, context)}/local-uploads` },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const result = readObject(envelope.result, "cloudflare r2 local uploads");

  return { enabled: optionalBoolean(result.enabled) === true };
}

async function updateBucketLocalUploads(input: Record<string, unknown>, context: CloudflareContext) {
  const bucketName = String(input.bucketName);
  const enabled = optionalBoolean(input.enabled) === true;
  await requestEnvelope(
    context.accessToken,
    {
      method: "PUT",
      path: `${buildCloudflareR2BucketPath(input, context)}/local-uploads`,
      body: { enabled },
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return { bucketName, enabled };
}

async function getSippyConfig(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/sippy`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2SippyConfig(envelope.result);
}

async function enableSippy(input: Record<string, unknown>, context: CloudflareContext) {
  const source = optionalRecord(input.source);
  if (optionalString(source?.provider) === "azure") {
    const hasAccountKey = source?.accountKey !== undefined;
    const hasSasToken = source?.sasToken !== undefined;
    if (hasAccountKey === hasSasToken) {
      throw new ProviderRequestError(400, "exactly one of source.accountKey or source.sasToken is required");
    }
  }
  const destination = await resolveSippyDestination(input, context);
  const envelope = await requestEnvelope(
    context.accessToken,
    {
      method: "PUT",
      path: `${buildCloudflareR2BucketPath(input, context)}/sippy`,
      body: {
        source: recordOrEmpty(input.source),
        destination: { provider: "r2", ...destination },
      },
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2SippyConfig(envelope.result);
}

async function disableSippy(input: Record<string, unknown>, context: CloudflareContext) {
  const bucketName = String(input.bucketName);
  await requestEnvelope(
    context.accessToken,
    {
      method: "DELETE",
      path: `${buildCloudflareR2BucketPath(input, context)}/sippy`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return { bucketName, enabled: false };
}

async function resolveSippyDestination(input: Record<string, unknown>, context: CloudflareContext) {
  const explicit = optionalRecord(input.destination);
  if (explicit) {
    return {
      accessKeyId: String(explicit.accessKeyId),
      secretAccessKey: String(explicit.secretAccessKey),
    };
  }
  const accessKeyId = await resolveCloudflareR2AccessKeyId(input, context);
  if (!accessKeyId) {
    throw new ProviderRequestError(400, "destination credentials are required when the connection uses OAuth");
  }
  return {
    accessKeyId,
    secretAccessKey: deriveCloudflareR2S3SecretAccessKey(context.accessToken),
  };
}

function normalizeR2SippyConfig(value: unknown) {
  const config = readObject(value, "cloudflare r2 sippy config");
  const source = optionalRecord(config.source);
  const destination = optionalRecord(config.destination);

  return compactObject({
    enabled: optionalBoolean(config.enabled) === true,
    source: source
      ? compactObject({
          provider: optionalString(source.provider) ?? "unknown",
          bucket: rawStringOrNull(source.bucket),
          bucketUrl: rawStringOrNull(source.bucketUrl),
          container: rawStringOrNull(source.container),
          region: rawStringOrNull(source.region),
        })
      : undefined,
    destination: destination
      ? compactObject({
          provider: optionalString(destination.provider) ?? "r2",
          account: optionalString(destination.account),
          bucket: optionalString(destination.bucket),
          accessKeyId: optionalString(destination.accessKeyId),
        })
      : undefined,
  });
}
