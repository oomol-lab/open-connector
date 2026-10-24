import type { ProviderActionHandlerSubset, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { CloudflareR2Context } from "./runtime.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  cloudflareR2RequestEnvelope,
  readObject,
  readOptionalStringArray,
  readRequiredString,
  resolveAccountId,
  resolveCloudflareR2AccessKeyId,
} from "./runtime.ts";

const cloudflareR2DefaultTemporaryCredentialTtlSeconds = 900;

export const cloudflareR2AccountActionHandlers: ProviderActionHandlerSubset<
  "cloudflare_r2",
  ProviderRuntimeHandler<CloudflareR2Context>
> = {
  get_account_metrics: cloudflareR2GetAccountMetrics,
  create_temporary_access_credentials: cloudflareR2CreateTemporaryAccessCredentials,
};

async function cloudflareR2GetAccountMetrics(input: Record<string, unknown>, context: CloudflareR2Context) {
  const accountId = resolveAccountId(input, context);
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    { path: `/accounts/${encodeURIComponent(accountId)}/r2/metrics` },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const metrics = readObject(envelope.result, "cloudflare r2 account metrics");

  return compactObject({
    standard: normalizeR2ClassMetrics(metrics.standard),
    infrequentAccess: normalizeR2ClassMetrics(metrics.infrequentAccess),
  });
}

async function cloudflareR2CreateTemporaryAccessCredentials(
  input: Record<string, unknown>,
  context: CloudflareR2Context,
) {
  const accountId = resolveAccountId(input, context);
  const parentAccessKeyId =
    optionalString(input.parentAccessKeyId) ?? (await resolveCloudflareR2AccessKeyId(input, context));
  if (!parentAccessKeyId) {
    throw new ProviderRequestError(400, "parentAccessKeyId is required when the connection uses OAuth");
  }
  const ttlSeconds = optionalInteger(input.ttlSeconds) ?? cloudflareR2DefaultTemporaryCredentialTtlSeconds;
  const requestedAt = Date.now();
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      method: "POST",
      path: `/accounts/${encodeURIComponent(accountId)}/r2/temp-access-credentials`,
      body: compactObject({
        bucket: String(input.bucketName),
        parentAccessKeyId,
        permission: String(input.permission),
        ttlSeconds,
        prefixes: readOptionalStringArray(input.prefixes),
        objects: readOptionalStringArray(input.objects),
      }),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const credentials = readObject(envelope.result, "cloudflare r2 temporary credentials");

  return {
    accessKeyId: readRequiredString(credentials, "accessKeyId"),
    secretAccessKey: readRequiredString(credentials, "secretAccessKey"),
    sessionToken: readRequiredString(credentials, "sessionToken"),
    estimatedExpiresAt: new Date(requestedAt + ttlSeconds * 1000).toISOString(),
  };
}

function normalizeR2ClassMetrics(value: unknown) {
  const classMetrics = optionalRecord(value);
  if (!classMetrics) {
    return undefined;
  }

  return compactObject({
    uploaded: normalizeR2SizeMetrics(classMetrics.uploaded),
    published: normalizeR2SizeMetrics(classMetrics.published),
  });
}

function normalizeR2SizeMetrics(value: unknown) {
  const sizeMetrics = optionalRecord(value);
  if (!sizeMetrics) {
    return undefined;
  }

  return compactObject({
    objects: optionalNumber(sizeMetrics.objects),
    payloadSize: optionalNumber(sizeMetrics.payloadSize),
    metadataSize: optionalNumber(sizeMetrics.metadataSize),
  });
}
