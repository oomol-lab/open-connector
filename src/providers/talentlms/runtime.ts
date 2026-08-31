import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalRecord, optionalString, recordOrEmpty, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, jsonObject, queryParams } from "../../core/request.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const talentlmsApiVersion = "2025-07-01";

const talentlmsApiPathPrefix = "/api/v2";
const talentlmsValidationPath = "/health";

type TalentlmsRequestPhase = "validate" | "execute";

interface TalentlmsRequestOptions {
  method: string;
  path: string;
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: TalentlmsRequestPhase;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
}

type TalentlmsActionHandler = (input: Record<string, unknown>, context: TalentlmsActionContext) => Promise<unknown>;

export interface TalentlmsActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const talentlmsActionHandlers: ProviderActionHandlers<"talentlms", TalentlmsActionHandler> = {
  health_check(_input, context) {
    return runHealthCheck(context);
  },
  list_users(input, context) {
    return listTalentlmsResource("users", input, context);
  },
  get_user(input, context) {
    return getTalentlmsResource("user", "users", input.userId, context);
  },
  create_user(input, context) {
    return writeTalentlmsResource("user", "POST", "users", buildUserBody(input), context);
  },
  update_user(input, context) {
    return writeTalentlmsResource(
      "user",
      "PATCH",
      `users/${encodeURIComponent(String(input.userId))}`,
      buildUserBody(input),
      context,
    );
  },
  delete_user(input, context) {
    return deleteTalentlmsResource("users", input.userId, context);
  },
  list_courses(input, context) {
    return listTalentlmsResource("courses", input, context);
  },
  get_course(input, context) {
    return getTalentlmsResource("course", "courses", input.courseId, context);
  },
  list_groups(input, context) {
    return listTalentlmsResource("groups", input, context);
  },
  get_group(input, context) {
    return getTalentlmsResource("group", "groups", input.groupId, context);
  },
  list_branches(input, context) {
    return listTalentlmsResource("branches", input, context);
  },
  get_branch(input, context) {
    return getTalentlmsResource("branch", "branches", input.branchId, context);
  },
  list_categories(input, context) {
    return listTalentlmsResource("categories", input, context);
  },
  get_category(input, context) {
    return getTalentlmsResource("category", "categories", input.categoryId, context);
  },
};

export async function validateTalentlmsCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = buildTalentlmsApiBaseUrl(readTalentlmsDomain({ domain: input.values.domain }));
  const payload = await talentlmsRequest({
    method: "GET",
    path: talentlmsValidationPath,
    apiKey: input.apiKey,
    apiBaseUrl,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: new URL(apiBaseUrl).hostname,
      displayName: `TalentLMS: ${new URL(apiBaseUrl).hostname}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl,
      validationEndpoint: talentlmsValidationPath,
      health: payload,
    },
  };
}

async function runHealthCheck(context: TalentlmsActionContext): Promise<unknown> {
  const payload = await talentlmsRequest({
    method: "GET",
    path: talentlmsValidationPath,
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    healthy: true,
    raw: recordOrEmpty(payload),
  };
}

async function listTalentlmsResource(
  resourceName: "users" | "courses" | "groups" | "branches" | "categories",
  input: Record<string, unknown>,
  context: TalentlmsActionContext,
): Promise<unknown> {
  const payload = await talentlmsRequest({
    method: "GET",
    path: `/${resourceName}`,
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: buildPaginationQuery(input),
  });
  const normalized = normalizeTalentlmsList(payload, resourceName);

  return {
    [resourceName]: normalized.items,
    links: normalized.links,
    raw: recordOrEmpty(payload),
  };
}

async function getTalentlmsResource(
  outputKey: string,
  resourceName: "users" | "courses" | "groups" | "branches" | "categories",
  id: unknown,
  context: TalentlmsActionContext,
): Promise<unknown> {
  const payload = await talentlmsRequest({
    method: "GET",
    path: `/${resourceName}/${encodeURIComponent(String(id))}`,
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    [outputKey]: normalizeTalentlmsEntity(payload, outputKey),
    raw: recordOrEmpty(payload),
  };
}

async function writeTalentlmsResource(
  outputKey: string,
  method: "POST" | "PATCH",
  path: string,
  body: Record<string, unknown>,
  context: TalentlmsActionContext,
): Promise<unknown> {
  const payload = await talentlmsRequest({
    method,
    path: `/${path}`,
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body,
  });

  return {
    [outputKey]: normalizeTalentlmsEntity(payload, outputKey),
    raw: recordOrEmpty(payload),
  };
}

async function deleteTalentlmsResource(
  resourceName: "users",
  id: unknown,
  context: TalentlmsActionContext,
): Promise<unknown> {
  const payload = await talentlmsRequest({
    method: "DELETE",
    path: `/${resourceName}/${encodeURIComponent(String(id))}`,
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    deleted: true,
    raw: recordOrEmpty(payload),
  };
}

async function talentlmsRequest(options: TalentlmsRequestOptions): Promise<unknown> {
  const url = assertPublicHttpUrl(`${options.apiBaseUrl}${options.path}`, {
    fieldName: "domain",
    createError: providerInputError,
  });
  for (const [key, value] of Object.entries(queryParams(options.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method,
      headers: buildTalentlmsHeaders(options.apiKey, options.body != null),
      body: options.body == null ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TalentLMS request failed: ${error.message}` : "TalentLMS request failed",
    );
  }

  const payload = await readTalentlmsPayload(response);
  if (!response.ok) {
    throw createTalentlmsError(response, payload, options.phase);
  }

  return payload;
}

function buildTalentlmsHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
    "x-api-version": talentlmsApiVersion,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function readTalentlmsPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "TalentLMS returned a non-JSON response");
  }
}

function createTalentlmsError(
  response: Response,
  payload: unknown,
  phase: TalentlmsRequestPhase,
): ProviderRequestError {
  const message = readTalentlmsErrorMessage(payload) ?? `TalentLMS request failed: ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function readTalentlmsErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const error = optionalRecord(object.error);
  return (
    optionalString(error?.message) ??
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(object.type)
  );
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    "page[number]": typeof input.pageNumber === "number" ? input.pageNumber : undefined,
    "page[size]": typeof input.pageSize === "number" ? input.pageSize : undefined,
  };
}

function buildUserBody(input: Record<string, unknown>): Record<string, unknown> {
  const rawFields = optionalRecord(input.rawFields) ?? {};
  return jsonObject({
    ...rawFields,
    email: input.email,
    name: buildUserName(input),
    surname: input.lastName,
    login: input.login,
    password: input.password,
    user_type: input.userType,
    timezone: input.timezone,
    language: input.language,
    status: input.status,
  });
}

function buildUserName(input: Record<string, unknown>): string | undefined {
  const firstName = optionalString(input.firstName);
  const lastName = optionalString(input.lastName);
  if (!firstName && !lastName) {
    return undefined;
  }

  return [firstName, lastName].filter(Boolean).join(" ");
}

function normalizeTalentlmsList(
  payload: unknown,
  resourceName: string,
): { items: Array<Record<string, unknown>>; links: Record<string, unknown> } {
  if (Array.isArray(payload)) {
    return { items: payload.map(asListItem), links: {} };
  }

  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `invalid talentlms ${resourceName} response`);
  }

  const data = object.data;
  if (Array.isArray(data)) {
    return {
      items: data.map(asListItem),
      links: readLinks(object),
    };
  }

  const directItems = object[resourceName];
  if (Array.isArray(directItems)) {
    return {
      items: directItems.map(asListItem),
      links: readLinks(object),
    };
  }

  throw new ProviderRequestError(502, `invalid talentlms ${resourceName} response`);
}

function normalizeTalentlmsEntity(payload: unknown, outputKey: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `invalid talentlms ${outputKey} response`);
  }

  const data = optionalRecord(object.data);
  if (data) {
    return data;
  }

  const wrapped = optionalRecord(object[outputKey]);
  if (wrapped) {
    return wrapped;
  }

  return object;
}

function asListItem(value: unknown): Record<string, unknown> {
  const item = optionalRecord(value);
  if (!item) {
    throw new ProviderRequestError(502, "invalid talentlms list item");
  }

  return item;
}

function readLinks(object: Record<string, unknown>): Record<string, unknown> {
  const links = optionalRecord(object.links);
  if (links) {
    return links;
  }

  return jsonObject({
    self: object.self,
    first: object.first,
    last: object.last,
    prev: object.prev,
    next: object.next,
  });
}

export function readTalentlmsDomain(input: { domain?: unknown }): string {
  return requiredString(input.domain, "domain", providerInputError);
}

export function buildTalentlmsApiBaseUrl(domain: string): string {
  const normalizedDomain = normalizeTalentlmsDomain(domain);
  return `https://${normalizedDomain}${talentlmsApiPathPrefix}`;
}

export function normalizeTalentlmsApiBaseUrl(apiBaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw providerInputError("TalentLMS API base URL must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw providerInputError("TalentLMS API base URL must use HTTPS");
  }
  if (url.pathname.replace(/\/$/, "") !== talentlmsApiPathPrefix) {
    throw providerInputError("TalentLMS API base URL must end with /api/v2");
  }

  const hostname = normalizeTalentlmsDomain(url.hostname);
  return `https://${hostname}${talentlmsApiPathPrefix}`;
}

function normalizeTalentlmsDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  const withoutProtocol = trimmed.startsWith("https://")
    ? trimmed.slice("https://".length)
    : trimmed.startsWith("http://")
      ? trimmed.slice("http://".length)
      : trimmed;
  const hostname = withoutProtocol.split("/")[0]?.replace(/\/$/, "") ?? "";
  if (hostname.includes(".") && !hostname.endsWith(".talentlms.com")) {
    throw providerInputError("domain must be a TalentLMS subdomain such as samples or samples.talentlms.com");
  }

  const normalized = hostname.endsWith(".talentlms.com") ? hostname : `${hostname}.talentlms.com`;
  const labels = normalized.split(".");
  const isValid =
    labels.length >= 3 &&
    labels[labels.length - 2] === "talentlms" &&
    labels[labels.length - 1] === "com" &&
    labels.every((label) => label.length > 0 && label.length <= 63);

  if (!isValid) {
    throw providerInputError("domain must be a TalentLMS subdomain such as samples or samples.talentlms.com");
  }

  return normalized;
}
