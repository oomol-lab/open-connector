import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface CloudflareEnvelope {
  success?: unknown;
  result?: unknown;
  errors?: unknown;
  messages?: unknown;
  result_info?: unknown;
}

interface CloudflareRequestInput {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

interface CloudflareAccount {
  id: string;
  name?: string;
  type?: string;
}

const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";

export const cloudflareDnsActionHandlers: ProviderActionHandlers<
  "cloudflare_dns",
  ProviderRuntimeHandler<BearerProviderContext>
> = {
  list_accounts(input, context) {
    return listAccounts(input, context);
  },
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
};

export async function validateCloudflareDnsToken(
  apiToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  try {
    const envelope = await cloudflareRequestEnvelope(
      apiToken,
      { path: "/user/tokens/verify" },
      { fetcher, signal },
      "validate",
    );
    const verification = readObject(envelope.result, "cloudflare token verification");
    const tokenId = optionalString(verification.id);
    const tokenStatus = optionalString(verification.status);
    if (tokenStatus && tokenStatus !== "active") {
      throw new ProviderRequestError(400, `cloudflare token is not active: ${tokenStatus}`);
    }

    return {
      profile: {
        accountId: tokenId,
        displayName: "Cloudflare DNS",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/user/tokens/verify",
        tokenId,
        tokenStatus,
        expiresOn: optionalString(verification.expires_on),
        notBefore: optionalString(verification.not_before),
      }),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 400) {
      const probe = await probeCloudflareDnsZones(apiToken, fetcher, signal);
      return {
        profile: {
          displayName: probe.accountLabel,
        },
        grantedScopes: [],
        metadata: {
          validationEndpoint: probe.validationEndpoint,
          validationFallback: "zone_probe",
          ...probe.metadata,
        },
      };
    }
    throw error;
  }
}

export async function requestCloudflareAccounts(
  apiToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  input: { page?: number; perPage?: number } = {},
): Promise<{ accounts: CloudflareAccount[]; resultInfo?: Record<string, unknown> }> {
  const envelope = await cloudflareRequestEnvelope(
    apiToken,
    {
      path: "/accounts",
      query: {
        page: input.page ?? 1,
        per_page: input.perPage ?? 50,
      },
    },
    { fetcher, signal },
    "execute",
  );
  if (!Array.isArray(envelope.result)) {
    throw new ProviderRequestError(502, "malformed cloudflare accounts response");
  }
  return {
    accounts: envelope.result.map((item) => normalizeAccount(item)),
    resultInfo: normalizeResultInfo(envelope.result_info),
  };
}

async function probeCloudflareDnsZones(
  apiToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{ validationEndpoint: string; accountLabel: string; metadata: Record<string, unknown> }> {
  const endpoint = "/zones?page=1&per_page=1";
  const envelope = await cloudflareRequestEnvelope(
    apiToken,
    { path: "/zones", query: { page: 1, per_page: 1 } },
    { fetcher, signal },
    "validate",
  );
  const zones = normalizeZoneList(envelope.result);
  const firstZone = zones[0] as Record<string, unknown> | undefined;
  const firstAccount = optionalRecord(firstZone?.account);
  return {
    validationEndpoint: endpoint,
    accountLabel: optionalString(firstAccount?.name) ?? optionalString(firstZone?.name) ?? "Cloudflare DNS",
    metadata: compactObject({
      firstZoneId: optionalString(firstZone?.id),
      firstZoneName: optionalString(firstZone?.name),
      accountId: optionalString(firstAccount?.id),
      accountName: optionalString(firstAccount?.name),
    }),
  };
}

async function listAccounts(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const result = await requestCloudflareAccounts(context.accessToken, context.fetcher, context.signal, {
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.perPage),
  });
  return result;
}

async function listZones(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
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

async function getZone(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const zoneId = String(input.zoneId);
  const envelope = await requestEnvelope(context, { path: `/zones/${encodeURIComponent(zoneId)}` }, "execute");
  return {
    zone: normalizeZone(envelope.result),
  };
}

async function listDnsRecords(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
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

async function getDnsRecord(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
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

async function createDnsRecord(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
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

async function updateDnsRecord(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
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

async function deleteDnsRecord(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
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
  context: BearerProviderContext,
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
    throw normalizeCloudflareError(response, envelope, phase);
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
  try {
    return (await response.json()) as CloudflareEnvelope;
  } catch {
    const text = (await response.text().catch(() => "")) || `cloudflare request failed with ${response.status}`;
    return {
      success: false,
      errors: [{ message: text }],
    };
  }
}

function normalizeCloudflareError(
  response: Response,
  envelope: CloudflareEnvelope,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readCloudflareErrorMessage(envelope, response.status);
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && [400, 401, 403, 404].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 404)) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function readCloudflareErrorMessage(envelope: CloudflareEnvelope, status: number): string {
  for (const error of Array.isArray(envelope.errors) ? envelope.errors : []) {
    const record = optionalRecord(error);
    const message = optionalString(record?.message);
    if (message) {
      return message;
    }
  }
  for (const messageEntry of Array.isArray(envelope.messages) ? envelope.messages : []) {
    const record = optionalRecord(messageEntry);
    const message = optionalString(record?.message);
    if (message) {
      return message;
    }
  }
  return `cloudflare request failed with ${status}`;
}

function normalizeAccount(value: unknown): CloudflareAccount {
  const account = readObject(value, "cloudflare account");
  return compactObject({
    id: readRequiredString(account, "id"),
    name: optionalString(account.name),
    type: optionalString(account.type),
  }) as CloudflareAccount;
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

function normalizeResultInfo(value: unknown): Record<string, unknown> | undefined {
  const resultInfo = optionalRecord(value);
  if (!resultInfo) {
    return undefined;
  }
  return compactObject({
    page: optionalInteger(resultInfo.page),
    perPage: optionalInteger(resultInfo.per_page),
    count: optionalInteger(resultInfo.count),
    totalCount: optionalInteger(resultInfo.total_count),
    totalPages: optionalInteger(resultInfo.total_pages),
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
