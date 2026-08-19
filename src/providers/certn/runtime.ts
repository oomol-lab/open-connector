import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const certnValidationPath = "/api/public/cases/";
const certnDefaultRequestTimeoutMs = 30_000;

export const certnRegions = {
  ca: {
    id: "ca",
    label: "North America",
    baseUrl: "https://api.ca.certn.co",
  },
  uk: {
    id: "uk",
    label: "Europe, Middle East and Africa",
    baseUrl: "https://api.uk.certn.co",
  },
  au: {
    id: "au",
    label: "Asia Pacific",
    baseUrl: "https://api.au.certn.co",
  },
  sandbox: {
    id: "sandbox",
    label: "Sandbox",
    baseUrl: "https://api.sandbox.certn.co",
  },
} as const;

export interface CertnProviderContext extends ApiKeyProviderContext {
  baseUrl: string;
}

type CertnRegionId = keyof typeof certnRegions;
type RequestPhase = "validate" | "execute";
type CertnActionHandler = (input: Record<string, unknown>, context: CertnProviderContext) => Promise<unknown>;

export const certnActionHandlers: ProviderActionHandlers<"certn", CertnActionHandler> = {
  async list_cases(input, context) {
    const payload = await requestCertnJson({
      context,
      path: "/api/public/cases/",
      method: "GET",
      phase: "execute",
      searchParams: buildListCasesSearchParams(input),
    });
    return normalizePaginatedPayload(payload, "cases");
  },
  async get_case(input, context) {
    const id = requireInputString(input.id, "id");
    const payload = await requestCertnJson({
      context,
      path: `/api/public/cases/${encodeURIComponent(id)}/`,
      method: "GET",
      phase: "execute",
    });
    return { case: normalizeObjectOrNull(payload) };
  },
  async list_users(input, context) {
    const payload = await requestCertnJson({
      context,
      path: "/api/public/users/",
      method: "GET",
      phase: "execute",
      searchParams: buildListUsersSearchParams(input),
    });
    return normalizePaginatedPayload(payload, "users");
  },
  async get_user(input, context) {
    const id = requireInputString(input.id, "id");
    const payload = await requestCertnJson({
      context,
      path: `/api/public/users/${encodeURIComponent(id)}/`,
      method: "GET",
      phase: "execute",
    });
    return { user: normalizeObjectOrNull(payload) };
  },
  async list_groups(input, context) {
    const payload = await requestCertnJson({
      context,
      path: "/api/public/groups/",
      method: "GET",
      phase: "execute",
      searchParams: buildListGroupsSearchParams(input),
    });
    return normalizePaginatedPayload(payload, "groups");
  },
  async get_group(input, context) {
    const id = requireInputString(input.id, "id");
    const payload = await requestCertnJson({
      context,
      path: `/api/public/groups/${encodeURIComponent(id)}/`,
      method: "GET",
      phase: "execute",
    });
    return { group: normalizeObjectOrNull(payload) };
  },
  async list_packages(input, context) {
    const payload = await requestCertnJson({
      context,
      path: "/api/public/packages/",
      method: "GET",
      phase: "execute",
      searchParams: buildListPackagesSearchParams(input),
    });
    return normalizePaginatedPayload(payload, "packages");
  },
  async list_events(input, context) {
    const payload = await requestCertnJson({
      context,
      path: "/api/public/events/",
      method: "GET",
      phase: "execute",
      searchParams: buildListEventsSearchParams(input),
    });
    return normalizePaginatedPayload(payload, "events");
  },
  async list_tags(input, context) {
    const payload = await requestCertnJson({
      context,
      path: "/api/public/tags/",
      method: "GET",
      phase: "execute",
      searchParams: buildListTagsSearchParams(input),
    });
    return normalizePaginatedPayload(payload, "tags");
  },
  async list_questionnaires(input, context) {
    const payload = await requestCertnJson({
      context,
      path: "/api/public/questionnaires/",
      method: "GET",
      phase: "execute",
      searchParams: buildPaginationSearchParams(input),
    });
    return normalizePaginatedPayload(payload, "questionnaires");
  },
};

export async function validateCertnCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const region = resolveCertnRegion(input.values.region);
  await requestCertnJson({
    context: {
      apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
      baseUrl: region.baseUrl,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    path: certnValidationPath,
    method: "GET",
    phase: "validate",
    searchParams: new URLSearchParams([
      ["page", "1"],
      ["page_size", "1"],
    ]),
  });

  return {
    profile: {
      accountId: `certn:${region.id}`,
      displayName: `Certn ${region.label} API Key`,
    },
    grantedScopes: [],
    metadata: {
      region: region.id,
      regionLabel: region.label,
      apiBaseUrl: region.baseUrl,
      validationEndpoint: certnValidationPath,
    },
  };
}

export function resolveCertnBaseUrl(metadata: Record<string, unknown>, values: Record<string, string>): string {
  const apiBaseUrl = optionalString(metadata.apiBaseUrl);
  if (apiBaseUrl && Object.values(certnRegions).some((region) => region.baseUrl === apiBaseUrl)) {
    return apiBaseUrl;
  }

  const metadataRegion = optionalString(metadata.region);
  if (metadataRegion) {
    return resolveCertnRegion(metadataRegion).baseUrl;
  }

  return resolveCertnRegion(values.region).baseUrl;
}

async function requestCertnJson(input: {
  context: CertnProviderContext;
  path: string;
  method: "GET";
  phase: RequestPhase;
  searchParams?: URLSearchParams;
}): Promise<unknown> {
  const response = await requestCertn(input);
  const payload = await readCertnPayload(response);
  if (!response.ok) {
    throw createCertnError(response, payload, input.phase);
  }
  return payload;
}

async function requestCertn(input: {
  context: CertnProviderContext;
  path: string;
  method: "GET";
  phase: RequestPhase;
  searchParams?: URLSearchParams;
}): Promise<Response> {
  const url = new URL(input.path, input.context.baseUrl);
  for (const [key, value] of input.searchParams ?? []) {
    url.searchParams.append(key, value);
  }

  const timeout = createProviderTimeout(input.context.signal, certnDefaultRequestTimeoutMs);
  try {
    return await input.context.fetcher(url, {
      method: input.method,
      signal: timeout.signal,
      headers: {
        accept: "application/json",
        authorization: `Api-Key ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    const message =
      timeout.didTimeout() || isAbortLikeError(error)
        ? "Certn request timed out"
        : error instanceof Error
          ? `Certn request failed: ${error.message}`
          : "Certn request failed";
    throw new ProviderRequestError(502, message);
  } finally {
    timeout.cleanup();
  }
}

async function readCertnPayload(response: Response): Promise<unknown> {
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

function createCertnError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message = extractCertnErrorMessage(payload) ?? response.statusText ?? "Certn request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 405, 406, 415, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractCertnErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.detail) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title);
  if (directMessage) {
    return directMessage;
  }

  const errors = record.errors;
  if (typeof errors === "string" && errors.trim()) {
    return errors.trim();
  }
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === "string" && item.trim()) {
        return item.trim();
      }
      const errorRecord = optionalRecord(item);
      const errorMessage = optionalString(errorRecord?.detail) ?? optionalString(errorRecord?.code);
      if (errorMessage) {
        return errorMessage;
      }
    }
  }

  return undefined;
}

function buildListCasesSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = buildPaginationSearchParams(input);
  appendSearchParam(searchParams, "email_address", input.emailAddress);
  appendRepeatedSearchParam(searchParams, "group", input.groupIds);
  appendRepeatedSearchParam(searchParams, "overall_status", input.overallStatuses);
  appendRepeatedSearchParam(searchParams, "tag", input.tags);
  appendRepeatedSearchParam(searchParams, "check_type", input.checkTypes);
  return searchParams;
}

function buildListUsersSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = buildPaginationSearchParams(input);
  appendSearchParam(searchParams, "email", input.email);
  appendSearchParam(searchParams, "full_name", input.fullName);
  appendRepeatedSearchParam(searchParams, "group", input.groupIds);
  appendSearchParam(searchParams, "id", input.id);
  appendSearchParam(searchParams, "is_active", input.isActive);
  appendRepeatedSearchParam(searchParams, "role", input.roles);
  return searchParams;
}

function buildListGroupsSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = buildPaginationSearchParams(input);
  appendSearchParam(searchParams, "id", input.id);
  appendSearchParam(searchParams, "is_active", input.isActive);
  appendSearchParam(searchParams, "name", input.name);
  appendSearchParam(searchParams, "parent_id", input.parentId);
  return searchParams;
}

function buildListPackagesSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = buildPaginationSearchParams(input);
  appendSearchParam(searchParams, "is_active", input.isActive);
  appendRepeatedSearchParam(searchParams, "permissible_purposes", input.permissiblePurposes);
  return searchParams;
}

function buildListEventsSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  appendSearchParam(searchParams, "page", input.page);
  appendSearchParam(searchParams, "last_processed_event_id", input.lastProcessedEventId);
  return searchParams;
}

function buildListTagsSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = buildPaginationSearchParams(input);
  appendSearchParam(searchParams, "id", input.id);
  appendSearchParam(searchParams, "is_active", input.isActive);
  appendSearchParam(searchParams, "name", input.name);
  return searchParams;
}

function buildPaginationSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  appendSearchParam(searchParams, "page", input.page);
  appendSearchParam(searchParams, "page_size", input.pageSize);
  return searchParams;
}

function appendSearchParam(searchParams: URLSearchParams, key: string, value: unknown): void {
  if (value == null || value === "") {
    return;
  }
  searchParams.append(key, String(value));
}

function appendRepeatedSearchParam(searchParams: URLSearchParams, key: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    appendSearchParam(searchParams, key, item);
  }
}

function normalizePaginatedPayload(payload: unknown, resultKey: string): Record<string, unknown> {
  const record = requireObjectPayload(payload, "Certn paginated response");
  return {
    [resultKey]: normalizeArray(record.results, "Certn paginated response results"),
    pagination: normalizePagination(record),
  };
}

function normalizePagination(record: Record<string, unknown>): Record<string, unknown> {
  const pagination = optionalRecord(record.pagination);
  if (pagination) {
    return compactObject({ ...pagination });
  }

  return compactObject({
    count: record.count,
    next: record.next,
    previous: record.previous,
  });
}

function normalizeArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item) =>
    item && typeof item === "object" && !Array.isArray(item) ? compactObject({ ...item }) : item,
  );
}

function normalizeObjectOrNull(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  return record ? compactObject({ ...record }) : null;
}

function requireObjectPayload(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function resolveCertnRegion(value: unknown): (typeof certnRegions)[CertnRegionId] {
  const region = optionalString(value)?.toLowerCase();
  if (region && region in certnRegions) {
    return certnRegions[region as CertnRegionId];
  }

  throw new ProviderRequestError(400, "region must be one of ca, uk, au, or sandbox");
}

function requireInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
