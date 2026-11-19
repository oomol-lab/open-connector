import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString, compactObject } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";
import { resolveAccountId } from "../shared/context.ts";
import {
  requestEnvelope,
  readObject,
  readOptionalStringArray,
  readRequiredString,
  resolveCloudflareR2AccessKeyId,
} from "./client.ts";

const defaultTemporaryCredentialTtlSeconds = 900;

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  get_account_metrics: getAccountMetrics,
  create_temporary_access_credentials: createTemporaryAccessCredentials,
};

async function getAccountMetrics(input: Record<string, unknown>, context: CloudflareContext) {
  const accountId = resolveAccountId(input, context);
  const envelope = await requestEnvelope(
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

async function createTemporaryAccessCredentials(input: Record<string, unknown>, context: CloudflareContext) {
  const accountId = resolveAccountId(input, context);
  const parentAccessKeyId =
    optionalString(input.parentAccessKeyId) ?? (await resolveCloudflareR2AccessKeyId(input, context));
  if (!parentAccessKeyId) {
    throw new ProviderRequestError(400, "parentAccessKeyId is required when the connection uses OAuth");
  }
  const ttlSeconds = optionalInteger(input.ttlSeconds) ?? defaultTemporaryCredentialTtlSeconds;
  const requestedAt = Date.now();
  const envelope = await requestEnvelope(
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
