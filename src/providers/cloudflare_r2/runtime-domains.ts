import type { ProviderActionHandlerSubset, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { CloudflareR2Context } from "./runtime.ts";

import { optionalRecord, optionalString, compactObject, optionalBoolean } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  buildCloudflareR2BucketPath,
  buildR2JurisdictionHeaders,
  cloudflareR2RequestEnvelope,
  readObject,
  readObjectArray,
  readOptionalStringArray,
  readRequiredBoolean,
  readRequiredString,
} from "./runtime.ts";

export const cloudflareR2DomainActionHandlers: ProviderActionHandlerSubset<
  "cloudflare_r2",
  ProviderRuntimeHandler<CloudflareR2Context>
> = {
  list_custom_domains: cloudflareR2ListCustomDomains,
  get_custom_domain: cloudflareR2GetCustomDomain,
  add_custom_domain: cloudflareR2AddCustomDomain,
  update_custom_domain: cloudflareR2UpdateCustomDomain,
  delete_custom_domain: cloudflareR2DeleteCustomDomain,
  get_managed_domain: cloudflareR2GetManagedDomain,
  update_managed_domain: cloudflareR2UpdateManagedDomain,
};

function buildCustomDomainPath(input: Record<string, unknown>, context: CloudflareR2Context) {
  const domain = String(input.domain);
  return `${buildCloudflareR2BucketPath(input, context)}/domains/custom/${encodeURIComponent(domain)}`;
}

async function cloudflareR2ListCustomDomains(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/domains/custom`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const result = readObject(envelope.result, "cloudflare r2 custom domain list");

  return {
    domains: readObjectArray(result.domains, "cloudflare r2 custom domain list").map(normalizeR2CustomDomainStrict),
  };
}

async function cloudflareR2GetCustomDomain(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      path: buildCustomDomainPath(input, context),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return {
    domain: normalizeR2CustomDomainStrict(readObject(envelope.result, "cloudflare r2 custom domain")),
  };
}

async function cloudflareR2AddCustomDomain(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      method: "POST",
      path: `${buildCloudflareR2BucketPath(input, context)}/domains/custom`,
      body: compactObject({
        domain: String(input.domain),
        zoneId: String(input.zoneId),
        enabled: optionalBoolean(input.enabled) ?? true,
        minTLS: optionalString(input.minTLS),
        ciphers: readOptionalStringArray(input.ciphers),
      }),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return {
    domain: normalizeR2CustomDomainStrict(readObject(envelope.result, "cloudflare r2 custom domain")),
  };
}

async function cloudflareR2UpdateCustomDomain(input: Record<string, unknown>, context: CloudflareR2Context) {
  if (input.enabled === undefined && input.minTLS === undefined && input.ciphers === undefined) {
    throw new ProviderRequestError(400, "enabled, minTLS, or ciphers is required");
  }
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      method: "PUT",
      path: buildCustomDomainPath(input, context),
      body: compactObject({
        enabled: optionalBoolean(input.enabled),
        minTLS: optionalString(input.minTLS),
        ciphers: readOptionalStringArray(input.ciphers),
      }),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return {
    domain: normalizeR2CustomDomain(readObject(envelope.result, "cloudflare r2 custom domain")),
  };
}

async function cloudflareR2DeleteCustomDomain(input: Record<string, unknown>, context: CloudflareR2Context) {
  const domain = String(input.domain);
  await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      method: "DELETE",
      path: buildCustomDomainPath(input, context),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return { domain, deleted: true };
}

async function cloudflareR2GetManagedDomain(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/domains/managed`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2ManagedDomain(envelope.result);
}

async function cloudflareR2UpdateManagedDomain(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      method: "PUT",
      path: `${buildCloudflareR2BucketPath(input, context)}/domains/managed`,
      body: { enabled: optionalBoolean(input.enabled) === true },
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2ManagedDomain(envelope.result);
}
function normalizeR2CustomDomainStrict(domain: Record<string, unknown>) {
  return { ...normalizeR2CustomDomain(domain), enabled: readRequiredBoolean(domain, "enabled") };
}
function normalizeR2CustomDomain(domain: Record<string, unknown>) {
  const status = optionalRecord(domain.status);

  return compactObject({
    domain: readRequiredString(domain, "domain"),
    enabled: optionalBoolean(domain.enabled),
    zoneId: optionalString(domain.zoneId),
    zoneName: optionalString(domain.zoneName),
    minTLS: optionalString(domain.minTLS),
    ciphers: readOptionalStringArray(domain.ciphers),
    status: status
      ? {
          ownership: readRequiredString(status, "ownership"),
          ssl: readRequiredString(status, "ssl"),
        }
      : undefined,
  });
}

function normalizeR2ManagedDomain(value: unknown) {
  const managed = readObject(value, "cloudflare r2 managed domain");

  return {
    bucketId: readRequiredString(managed, "bucketId"),
    domain: readRequiredString(managed, "domain"),
    enabled: optionalBoolean(managed.enabled) === true,
  };
}
