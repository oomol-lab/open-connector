import type { ProviderActionHandlerSubset, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { CloudflareR2Context } from "./runtime.ts";

import {
  looseArray,
  recordOrEmpty,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  compactObject,
  optionalBoolean,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  buildCloudflareR2BucketPath,
  buildR2JurisdictionHeaders,
  cloudflareR2RequestEnvelope,
  readObject,
  readObjectArray,
  resolveCloudflareR2AccessKeyId,
} from "./runtime.ts";
import { deriveCloudflareR2S3SecretAccessKey } from "./s3-presign.ts";

export const cloudflareR2BucketSettingsActionHandlers: ProviderActionHandlerSubset<
  "cloudflare_r2",
  ProviderRuntimeHandler<CloudflareR2Context>
> = {
  get_bucket_lifecycle: cloudflareR2GetBucketLifecycle,
  update_bucket_lifecycle: cloudflareR2UpdateBucketLifecycle,
  get_bucket_lock: cloudflareR2GetBucketLock,
  update_bucket_lock: cloudflareR2UpdateBucketLock,
  get_bucket_local_uploads: cloudflareR2GetBucketLocalUploads,
  update_bucket_local_uploads: cloudflareR2UpdateBucketLocalUploads,
  get_sippy_config: cloudflareR2GetSippyConfig,
  enable_sippy: cloudflareR2EnableSippy,
  disable_sippy: cloudflareR2DisableSippy,
};

async function readBucketRules(
  input: Record<string, unknown>,
  context: CloudflareR2Context,
  subresource: "lifecycle" | "lock",
) {
  const envelope = await cloudflareR2RequestEnvelope(
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
  context: CloudflareR2Context,
  subresource: "lifecycle" | "lock",
) {
  const bucketName = String(input.bucketName);
  await cloudflareR2RequestEnvelope(
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

function cloudflareR2GetBucketLifecycle(input: Record<string, unknown>, context: CloudflareR2Context) {
  return readBucketRules(input, context, "lifecycle");
}

function cloudflareR2UpdateBucketLifecycle(input: Record<string, unknown>, context: CloudflareR2Context) {
  return writeBucketRules(input, context, "lifecycle");
}

function cloudflareR2GetBucketLock(input: Record<string, unknown>, context: CloudflareR2Context) {
  return readBucketRules(input, context, "lock");
}

function cloudflareR2UpdateBucketLock(input: Record<string, unknown>, context: CloudflareR2Context) {
  return writeBucketRules(input, context, "lock");
}

async function cloudflareR2GetBucketLocalUploads(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    { path: `${buildCloudflareR2BucketPath(input, context)}/local-uploads` },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const result = readObject(envelope.result, "cloudflare r2 local uploads");

  return { enabled: optionalBoolean(result.enabled) === true };
}

async function cloudflareR2UpdateBucketLocalUploads(input: Record<string, unknown>, context: CloudflareR2Context) {
  const bucketName = String(input.bucketName);
  const enabled = optionalBoolean(input.enabled) === true;
  await cloudflareR2RequestEnvelope(
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

async function cloudflareR2GetSippyConfig(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
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

async function cloudflareR2EnableSippy(input: Record<string, unknown>, context: CloudflareR2Context) {
  const source = optionalRecord(input.source);
  if (optionalString(source?.provider) === "azure") {
    const hasAccountKey = source?.accountKey !== undefined;
    const hasSasToken = source?.sasToken !== undefined;
    if (hasAccountKey === hasSasToken) {
      throw new ProviderRequestError(400, "exactly one of source.accountKey or source.sasToken is required");
    }
  }
  const destination = await resolveSippyDestination(input, context);
  const envelope = await cloudflareR2RequestEnvelope(
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

async function cloudflareR2DisableSippy(input: Record<string, unknown>, context: CloudflareR2Context) {
  const bucketName = String(input.bucketName);
  await cloudflareR2RequestEnvelope(
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
async function resolveSippyDestination(input: Record<string, unknown>, context: CloudflareR2Context) {
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
