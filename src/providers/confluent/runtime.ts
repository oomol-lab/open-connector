import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const confluentApiBaseUrl = "https://api.confluent.cloud";

export interface ConfluentContext {
  apiKeyId: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface RequestInput {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  mode: "validate" | "execute";
}

export const confluentActionHandlers: ProviderActionHandlers<
  "confluent",
  (input: Record<string, unknown>, context: ConfluentContext) => Promise<unknown>
> = {
  list_organizations: (input, context) => listResources(input, context, "/org/v2/organizations", "organizations"),
  async get_organization(input, context) {
    return getResource(
      context,
      `/org/v2/organizations/${encodeURIComponent(readInputString(input.organizationId, "organizationId"))}`,
      "organization",
    );
  },
  list_environments: (input, context) => listResources(input, context, "/org/v2/environments", "environments"),
  async get_environment(input, context) {
    return getResource(
      context,
      `/org/v2/environments/${encodeURIComponent(readInputString(input.environmentId, "environmentId"))}`,
      "environment",
    );
  },
  async create_environment(input, context) {
    const payload = await requestConfluentJson(context, {
      path: "/org/v2/environments",
      method: "POST",
      mode: "execute",
      body: compactObject({
        display_name: readInputString(input.displayName, "displayName"),
        stream_governance_config: governanceConfig(input.governancePackage),
      }),
    });
    return { environment: requireRecord(payload, "Confluent environment response") };
  },
  async update_environment(input, context) {
    const environmentId = readInputString(input.environmentId, "environmentId");
    const displayName = optionalInputString(input.displayName, "displayName");
    const governancePackage = optionalInputString(input.governancePackage, "governancePackage");
    if (!displayName && !governancePackage)
      throw new ProviderRequestError(400, "update_environment requires displayName or governancePackage");
    const payload = await requestConfluentJson(context, {
      path: `/org/v2/environments/${encodeURIComponent(environmentId)}`,
      method: "PATCH",
      mode: "execute",
      body: compactObject({ display_name: displayName, stream_governance_config: governanceConfig(governancePackage) }),
    });
    return { environment: requireRecord(payload, "Confluent environment response") };
  },
  async delete_environment(input, context) {
    await requestConfluentJson(context, {
      path: `/org/v2/environments/${encodeURIComponent(readInputString(input.environmentId, "environmentId"))}`,
      method: "DELETE",
      mode: "execute",
    });
    return { deleted: true };
  },
  async list_kafka_clusters(input, context) {
    return listResources(input, context, "/cmk/v2/clusters", "clusters", {
      environment: readInputString(input.environmentId, "environmentId"),
    });
  },
  async get_kafka_cluster(input, context) {
    return getResource(
      context,
      `/cmk/v2/clusters/${encodeURIComponent(readInputString(input.clusterId, "clusterId"))}`,
      "cluster",
      { environment: readInputString(input.environmentId, "environmentId") },
    );
  },
};

export async function validateConfluentCredential(context: ConfluentContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = requireRecord(
    await requestConfluentJson(context, { path: "/org/v2/organizations", query: { page_size: "1" }, mode: "validate" }),
    "Confluent organizations response",
  );
  const organization = Array.isArray(payload.data) ? optionalRecord(payload.data[0]) : undefined;
  const organizationId = optionalTrimmedString(organization?.id);
  return {
    profile: {
      accountId: organizationId ?? context.apiKeyId,
      displayName: optionalTrimmedString(organization?.display_name) ?? `Confluent Cloud ${context.apiKeyId}`,
    },
    grantedScopes: [],
    metadata: compactObject({ apiBaseUrl: confluentApiBaseUrl, apiKeyId: context.apiKeyId, organizationId }),
  };
}

async function listResources(
  input: Record<string, unknown>,
  context: ConfluentContext,
  path: string,
  resourceName: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const pageSize = optionalInteger(input.pageSize);
  const payload = requireRecord(
    await requestConfluentJson(context, {
      path,
      mode: "execute",
      query: compactObject({
        ...query,
        page_size: pageSize === undefined ? undefined : String(pageSize),
        page_token: optionalInputString(input.pageToken, "pageToken"),
      }),
    }),
    `Confluent ${resourceName} response`,
  );
  if (!Array.isArray(payload.data))
    throw new ProviderRequestError(502, `Confluent ${resourceName} response has no data array`, payload);
  return {
    [resourceName]: payload.data.map((item) => requireRecord(item, `Confluent ${resourceName} item`)),
    pagination: normalizePagination(payload.metadata),
  };
}

async function getResource(
  context: ConfluentContext,
  path: string,
  resourceName: string,
  query?: Record<string, string>,
): Promise<unknown> {
  return {
    [resourceName]: requireRecord(
      await requestConfluentJson(context, { path, query, mode: "execute" }),
      `Confluent ${resourceName} response`,
    ),
  };
}

export async function requestConfluentJson(context: ConfluentContext, input: RequestInput): Promise<unknown> {
  const url = new URL(input.path, `${confluentApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, value);
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: compactObject({
        accept: "application/json",
        authorization: buildConfluentAuthorizationHeader(context.apiKeyId, context.apiSecret),
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
      }) as Record<string, string>,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw mapError(response.status, payload, input.mode);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout()
        ? "Confluent request timed out"
        : error instanceof Error
          ? `Confluent request failed: ${error.message}`
          : "Confluent request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

export function buildConfluentAuthorizationHeader(apiKeyId: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKeyId}:${apiSecret}`, "utf8").toString("base64")}`;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
function optionalInputString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  const result = optionalString(value)?.trim();
  if (!result) throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  return result;
}
function governanceConfig(value: unknown): Record<string, string> | undefined {
  const name = optionalInputString(value, "governancePackage");
  return name ? { package: name } : undefined;
}
function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} is not an object`, value);
  return record;
}
function optionalTrimmedString(value: unknown): string | undefined {
  const result = optionalString(value)?.trim();
  return result || undefined;
}
function normalizePagination(value: unknown): Record<string, unknown> {
  const metadata = optionalRecord(value);
  const next = optionalTrimmedString(metadata?.next) ?? null;
  return {
    first: optionalTrimmedString(metadata?.first) ?? null,
    last: optionalTrimmedString(metadata?.last) ?? null,
    previous: optionalTrimmedString(metadata?.prev) ?? null,
    next,
    nextPageToken: readPageToken(next),
    totalSize: typeof metadata?.total_size === "number" ? metadata.total_size : null,
  };
}
function readPageToken(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("page_token");
  } catch {
    return null;
  }
}
async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
function mapError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  const message =
    optionalTrimmedString(error?.message) ??
    optionalTrimmedString(record?.message) ??
    (typeof payload === "string" && payload.trim() ? payload.trim() : `Confluent request failed (${status})`);
  if (status === 401 || status === 403)
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}
