import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "onedesk";
const onedeskApiBaseUrl = "https://app.onedesk.com";
const organizationProfilePath = "/rest/public/organization/profileAndPolicy";

type OnedeskRequestPhase = "validate" | "execute";
type OnedeskActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const onedeskActionHandlers: ProviderActionHandlers<"onedesk", OnedeskActionHandler> = {
  get_organization_profile(_input, context) {
    return getOrganizationProfile(context);
  },
  filter_projects(input, context) {
    return filterExternalIds("/rest/public/projects/filter", buildFilterBody(input), context);
  },
  get_project(input, context) {
    return getDetails("project", buildDetailPath("/rest/public/projects", input), context);
  },
  filter_items(input, context) {
    return filterExternalIds("/rest/public/items/filter", buildItemFilterBody(input), context);
  },
  get_item(input, context) {
    return getDetails("item", buildDetailPath("/rest/public/items", input), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, onedeskActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const profile = await onedeskGetJson({
      path: organizationProfilePath,
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const data = optionalRecord(optionalRecord(profile)?.data);
    const organizationName = optionalString(data?.organizationName);
    const organizationUri = optionalString(data?.organizationUri);

    return {
      profile: {
        accountId: organizationUri ?? organizationName,
        displayName: organizationName ?? organizationUri ?? "OneDesk API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: onedeskApiBaseUrl,
        validationEndpoint: organizationProfilePath,
        organizationName,
        organizationUri,
      }),
    };
  },
};

async function getOrganizationProfile(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await onedeskGetJson({
    path: organizationProfilePath,
    context,
    phase: "execute",
  });
  return normalizeResultCodeData(payload);
}

async function filterExternalIds(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await onedeskPostJson(path, body, context);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "OneDesk returned invalid JSON", payload);
  }

  return {
    code: optionalString(record.code) ?? null,
    externalIds: readStringArray(record.data),
    totalNum: readNullableInteger(record.totalNum),
    appliedPropertyFilters: readObjectArray(record.appliedPropertyFilters),
    appliedCustomFieldFilters: readObjectArray(record.appliedCustomFieldFilters),
    notAppliedPropertyFilters: readStringArray(record.notAppliedPropertyFilters),
    notAppliedCustomFieldFilters: readStringArray(record.notAppliedCustomFieldFilters),
    raw: record,
  };
}

async function getDetails(
  outputKey: "project" | "item",
  path: string,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await onedeskGetJson({
    path,
    context,
    phase: "execute",
  });
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "OneDesk returned invalid JSON", payload);
  }

  const data = optionalRecord(record.data);
  if (!data) {
    throw new ProviderRequestError(502, "OneDesk detail response did not include data", payload);
  }

  return {
    code: optionalString(record.code) ?? null,
    [outputKey]: data,
    raw: record,
  };
}

async function onedeskGetJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: OnedeskRequestPhase;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(new URL(input.path, onedeskApiBaseUrl), {
      method: "GET",
      headers: onedeskHeaders(input.context.apiKey, {
        accept: "application/json",
      }),
      signal: input.context.signal,
    });
    payload = await readOnedeskPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OneDesk request failed: ${error.message}` : "OneDesk request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createOnedeskError(response, payload, input.phase);
  }

  return payload;
}

async function onedeskPostJson(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, onedeskApiBaseUrl), {
      method: "POST",
      headers: onedeskHeaders(context.apiKey, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readOnedeskPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OneDesk request failed: ${error.message}` : "OneDesk request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createOnedeskError(response, payload, "execute");
  }

  return payload;
}

function onedeskHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    "OD-Public-API-Key": apiKey,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readOnedeskPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createOnedeskError(response: Response, payload: unknown, phase: OnedeskRequestPhase): ProviderRequestError {
  const message = extractOnedeskErrorMessage(payload) ?? response.statusText ?? "OneDesk request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractOnedeskErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.code)
  );
}

function buildFilterBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    properties: readOptionalArray(input.properties),
    customFields: normalizeCustomFieldFilters(input.customFields),
    isAsc: optionalBoolean(input.isAsc),
    limit: input.limit,
    offset: input.offset,
  });
}

function buildItemFilterBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    itemType: input.itemTypes,
    properties: readOptionalArray(input.properties),
    customFields: normalizeCustomFieldFilters(input.customFields),
    isAsc: optionalBoolean(input.isAsc),
    limit: input.limit,
    offset: input.offset,
  });
}

function normalizeCustomFieldFilters(value: unknown): unknown[] | undefined {
  const filters = readOptionalArray(value);
  return filters?.map((filter) => {
    const record = optionalRecord(filter);
    if (!record || !("name" in record)) {
      return filter;
    }
    const { name, ...rest } = record;
    return { property: name, ...rest };
  });
}

function buildDetailPath(basePath: string, input: Record<string, unknown>): string {
  const externalId = optionalString(input.externalId);
  if (externalId) {
    return `${basePath}/externalId/${encodeURIComponent(externalId)}`;
  }

  return `${basePath}/id/${input.id}`;
}

function normalizeResultCodeData(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "OneDesk returned invalid JSON", payload);
  }

  return {
    code: optionalString(record.code) ?? null,
    data: record.data ?? null,
    raw: record,
  };
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)));
}

function readNullableInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.onedesk.com",
  auth: { type: "api_key_header", name: "od-public-api-key" },
});
