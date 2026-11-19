import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareEnvelope } from "../shared/client.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../../core/cast.ts";
import { queryParams } from "../../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../../provider-runtime.ts";
import { normalizeResultInfo } from "../shared/accounts.ts";
import { withCloudflareClient } from "../shared/action-client.ts";
import { cloudflareApiBaseUrl } from "../shared/client.ts";
import { cloudflareResponseError, parseCloudflareResponseText } from "../shared/errors.ts";

interface CloudflareRequestInput {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  list_zones(input, context) {
    return listZones(input, context);
  },
  get_zone(input, context) {
    return getZone(input, context);
  },
  list_dns_records(input, context) {
    return listDnsRecords(input, context);
  },
  get_dns_record(input, context) {
    return getDnsRecord(input, context);
  },
  create_dns_record(input, context) {
    return createDnsRecord(input, context);
  },
  update_dns_record(input, context) {
    return updateDnsRecord(input, context);
  },
  delete_dns_record(input, context) {
    return deleteDnsRecord(input, context);
  },
  create_zone: withCloudflareClient((client) =>
    client.resource({
      path: "/zones",
      method: "POST",
      body: {
        account: { id: client.input.accountId },
        name: client.input.name,
        type: client.input.type ?? "full",
        jump_start: client.input.jumpStart,
      },
    }),
  ),
  get_zone_setting: withCloudflareClient((client) =>
    client.resource({ path: `${client.zonePath()}/settings/${client.id("settingId")}` }),
  ),
  get_zone_dns_settings: withCloudflareClient((client) =>
    client.resource({ path: `${client.zonePath()}/dns_settings` }),
  ),
};

async function listZones(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const envelope = await requestEnvelope(
    context,
    {
      path: "/zones",
      query: {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        name: optionalString(input.name),
        status: optionalString(input.status),
        "account.id": optionalString(input.accountId),
        match: optionalString(input.match),
        order: optionalString(input.order),
        direction: optionalString(input.direction),
      },
    },
    "execute",
  );
  return {
    zones: normalizeZoneList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function getZone(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const zoneId = String(input.zoneId);
  const envelope = await requestEnvelope(context, { path: `/zones/${encodeURIComponent(zoneId)}` }, "execute");
  return {
    zone: normalizeZone(envelope.result),
  };
}

async function listDnsRecords(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const zoneId = String(input.zoneId);
  const envelope = await requestEnvelope(
    context,
    {
      path: `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      query: {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        type: optionalString(input.type),
        name: optionalString(input.name),
        content: optionalString(input.content),
        proxied: optionalBoolean(input.proxied),
        match: optionalString(input.match),
        order: optionalString(input.order),
        direction: optionalString(input.direction),
      },
    },
    "execute",
  );
  return {
    records: normalizeDnsRecordList(envelope.result),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function getDnsRecord(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const zoneId = String(input.zoneId);
  const dnsRecordId = String(input.dnsRecordId);
  const envelope = await requestEnvelope(
    context,
    { path: `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(dnsRecordId)}` },
    "execute",
  );
  return {
    record: normalizeDnsRecord(envelope.result),
  };
}

async function createDnsRecord(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  if (input.content === undefined && input.data === undefined) {
    throw new ProviderRequestError(400, "content or data is required");
  }
  const zoneId = String(input.zoneId);
  const envelope = await requestEnvelope(
    context,
    {
      method: "POST",
      path: `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      body: buildDnsRecordMutationBody(input),
    },
    "execute",
  );
  return {
    record: normalizeDnsRecord(envelope.result),
  };
}

async function updateDnsRecord(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  if (
    !["type", "name", "content", "data", "ttl", "proxied", "priority", "comment", "tags", "settings"].some(
      (key) => input[key] !== undefined,
    )
  ) {
    throw new ProviderRequestError(400, "at least one DNS record field must be provided");
  }
  const zoneId = String(input.zoneId);
  const dnsRecordId = String(input.dnsRecordId);
  const envelope = await requestEnvelope(
    context,
    {
      method: "PATCH",
      path: `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(dnsRecordId)}`,
      body: buildDnsRecordMutationBody(input),
    },
    "execute",
  );
  return {
    record: normalizeDnsRecord(envelope.result),
  };
}

async function deleteDnsRecord(input: Record<string, unknown>, context: CloudflareContext): Promise<unknown> {
  const zoneId = String(input.zoneId);
  const dnsRecordId = String(input.dnsRecordId);
  await requestEnvelope(
    context,
    {
      method: "DELETE",
      path: `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(dnsRecordId)}`,
    },
    "execute",
  );
  return {
    id: dnsRecordId,
    deleted: true,
  };
}

function buildDnsRecordMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    type: optionalString(input.type),
    name: optionalString(input.name),
    content: typeof input.content === "string" ? input.content : undefined,
    data: optionalRecord(input.data),
    ttl: optionalInteger(input.ttl),
    proxied: optionalBoolean(input.proxied),
    priority: optionalInteger(input.priority),
    comment: typeof input.comment === "string" ? input.comment : undefined,
    tags: normalizeOptionalStringArray(input.tags),
    settings: optionalRecord(input.settings),
  });
}

async function requestEnvelope(
  context: CloudflareContext,
  request: CloudflareRequestInput,
  phase: "validate" | "execute",
): Promise<CloudflareEnvelope> {
  return cloudflareRequestEnvelope(context.accessToken, request, context, phase);
}

async function cloudflareRequestEnvelope(
  accessToken: string,
  request: CloudflareRequestInput,
  context: { fetcher: typeof fetch; signal?: AbortSignal },
  phase: "validate" | "execute",
): Promise<CloudflareEnvelope> {
  const response = await context.fetcher(buildCloudflareUrl(request.path, request.query), {
    method: request.method ?? "GET",
    headers: cloudflareHeaders(accessToken, request.body !== undefined),
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    signal: context.signal,
  });
  const envelope = await readCloudflareEnvelope(response);
  if (!response.ok || envelope.success === false) {
    throw cloudflareResponseError(response, envelope, phase);
  }
  return envelope;
}

function buildCloudflareUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${cloudflareApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams(query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function cloudflareHeaders(accessToken: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readCloudflareEnvelope(response: Response): Promise<CloudflareEnvelope> {
  return parseCloudflareResponseText(await response.text());
}

function normalizeZoneList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare zones response");
  }
  return value.map((item) => normalizeZone(item));
}

function normalizeZone(value: unknown): Record<string, unknown> {
  const zone = readObject(value, "cloudflare zone");
  return compactObject({
    id: readRequiredString(zone, "id"),
    name: readRequiredString(zone, "name"),
    status: optionalString(zone.status),
    type: optionalString(zone.type),
    paused: optionalBoolean(zone.paused),
    createdOn: optionalString(zone.created_on),
    modifiedOn: optionalString(zone.modified_on),
    nameServers: readOptionalStringArray(zone.name_servers),
    originalNameServers: readOptionalStringArray(zone.original_name_servers),
    account: normalizeOptionalAccount(zone.account),
    meta: optionalRecord(zone.meta),
  });
}

function normalizeDnsRecordList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "malformed cloudflare dns record list response");
  }
  return value.map((item) => normalizeDnsRecord(item));
}

function normalizeDnsRecord(value: unknown): Record<string, unknown> {
  const record = readObject(value, "cloudflare dns record");
  return compactObject({
    id: readRequiredString(record, "id"),
    zoneId: optionalString(record.zone_id),
    zoneName: optionalString(record.zone_name),
    type: readRequiredString(record, "type"),
    name: readRequiredString(record, "name"),
    content: record.content === null ? null : optionalString(record.content),
    ttl: optionalInteger(record.ttl),
    proxied: optionalBoolean(record.proxied),
    proxiable: optionalBoolean(record.proxiable),
    priority: optionalInteger(record.priority),
    comment: record.comment === null ? null : optionalString(record.comment),
    tags: readOptionalStringArray(record.tags),
    createdOn: optionalString(record.created_on),
    modifiedOn: optionalString(record.modified_on),
    commentModifiedOn: optionalString(record.comment_modified_on),
    tagsModifiedOn: optionalString(record.tags_modified_on),
    data: optionalRecord(record.data),
    meta: optionalRecord(record.meta),
    settings: optionalRecord(record.settings),
  });
}

function normalizeOptionalAccount(value: unknown): Record<string, unknown> | undefined {
  const account = optionalRecord(value);
  if (!account) {
    return undefined;
  }
  return compactObject({
    id: optionalString(account.id),
    name: optionalString(account.name),
    type: optionalString(account.type),
  });
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed ${label} response`);
  }
  return record;
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = optionalString(record[field]);
  if (!value) {
    throw new ProviderRequestError(502, `malformed cloudflare response: missing ${field}`);
  }
  return value;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => typeof item === "string");
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}
