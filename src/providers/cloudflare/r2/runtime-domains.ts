import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { optionalRecord, optionalString, compactObject, optionalBoolean } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";
import { withAccountHandlers } from "../shared/context.ts";
import {
  buildCloudflareR2BucketPath,
  buildR2JurisdictionHeaders,
  requestEnvelope,
  readObject,
  readObjectArray,
  readOptionalStringArray,
  readRequiredBoolean,
  readRequiredString,
} from "./client.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = withAccountHandlers({
  list_custom_domains: listCustomDomains,
  get_custom_domain: getCustomDomain,
  add_custom_domain: addCustomDomain,
  update_custom_domain: updateCustomDomain,
  delete_custom_domain: deleteCustomDomain,
  get_managed_domain: getManagedDomain,
  update_managed_domain: updateManagedDomain,
});

function buildCustomDomainPath(input: Record<string, unknown>, context: CloudflareContext) {
  const domain = String(input.domain);
  return `${buildCloudflareR2BucketPath(input, context)}/domains/custom/${encodeURIComponent(domain)}`;
}

async function listCustomDomains(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.authHeaders,
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

async function getCustomDomain(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.authHeaders,
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

async function addCustomDomain(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.authHeaders,
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

async function updateCustomDomain(input: Record<string, unknown>, context: CloudflareContext) {
  if (input.enabled === undefined && input.minTLS === undefined && input.ciphers === undefined) {
    throw new ProviderRequestError(400, "enabled, minTLS, or ciphers is required");
  }
  const envelope = await requestEnvelope(
    context.authHeaders,
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

async function deleteCustomDomain(input: Record<string, unknown>, context: CloudflareContext) {
  const domain = String(input.domain);
  await requestEnvelope(
    context.authHeaders,
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

async function getManagedDomain(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.authHeaders,
    {
      path: `${buildCloudflareR2BucketPath(input, context)}/domains/managed`,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2ManagedDomain(envelope.result);
}

async function updateManagedDomain(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
    context.authHeaders,
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
