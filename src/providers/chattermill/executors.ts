import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactJson, queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "chattermill";
const apiBaseUrl = "https://api.chattermill.com/v1";

type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const families = {
  data_source: ["data_sources", "dataSources", "dataSource"],
  data_type: ["data_types", "dataTypes", "dataType"],
  theme: ["themes", "themes", "theme"],
  category: ["categories", "categories", "category"],
  attribute: ["attributes", "attributes", "attribute"],
  tag: ["tags", "tags", "tag"],
} as const;

export const chattermillActionHandlers: ProviderActionHandlers<"chattermill", Handler> = {
  async list_projects(_input, context) {
    const raw = await getJson("/projects", context);
    return { projects: extractArray(raw, "projects"), raw };
  },
  get_project(input, context) {
    return getWrapped(`/projects/${encodeURIComponent(requiredString(input.id, "id"))}`, "project", context);
  },
  async list_responses(input, context) {
    const raw = await getJson(`/${encodeURIComponent(requiredString(input.project, "project"))}/responses`, context, {
      query: responseQuery(input),
    });
    return { responses: extractArray(raw, "responses"), raw };
  },
  get_response(input, context) {
    return getWrapped(
      `/${encodeURIComponent(requiredString(input.project, "project"))}/responses/${encodeURIComponent(requiredString(input.id, "id"))}`,
      "response",
      context,
    );
  },
  create_response(input, context) {
    return writeResponse(input, context, "POST");
  },
  update_response(input, context) {
    return writeResponse(input, context, "PUT");
  },
  async delete_response(input, context) {
    const responseId = requiredString(input.responseId, "responseId");
    const raw = await requestJson(
      `/${encodeURIComponent(requiredString(input.project, "project"))}/responses/${encodeURIComponent(responseId)}`,
      context,
      { method: "DELETE" },
    );
    return { deleted: true, responseId, raw };
  },
  async search_responses(input, context) {
    const raw = await getJson(
      `/${encodeURIComponent(requiredString(input.project, "project"))}/responses/search`,
      context,
      { query: responseQuery(input) },
    );
    return { responses: extractArray(raw, "responses"), raw };
  },
  list_data_sources(input, context) {
    return listFamily(input, context, families.data_source);
  },
  get_data_source(input, context) {
    return getFamily(input, context, families.data_source);
  },
  list_data_types(input, context) {
    return listFamily(input, context, families.data_type);
  },
  get_data_type(input, context) {
    return getFamily(input, context, families.data_type);
  },
  async list_custom_segments(input, context) {
    const raw = await getJson(
      `/${encodeURIComponent(requiredString(input.project, "project"))}/custom_segments`,
      context,
    );
    return { customSegments: extractArray(raw, "custom_segments"), raw };
  },
  async get_metric(input, context) {
    const raw = await getJson(
      `/${encodeURIComponent(requiredString(input.project, "project"))}/metrics/${encodeURIComponent(requiredString(input.type, "type"))}`,
      context,
      { query: input },
    );
    return { metric: raw, raw };
  },
  list_themes(input, context) {
    return listFamily(input, context, families.theme);
  },
  get_theme(input, context) {
    return getFamily(input, context, families.theme);
  },
  list_categories(input, context) {
    return listFamily(input, context, families.category);
  },
  get_category(input, context) {
    return getFamily(input, context, families.category);
  },
  list_attributes(input, context) {
    return listFamily(input, context, families.attribute);
  },
  get_attribute(input, context) {
    return getFamily(input, context, families.attribute);
  },
  list_tags(input, context) {
    return listFamily(input, context, families.tag);
  },
  get_tag(input, context) {
    return getFamily(input, context, families.tag);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chattermillActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const payload = await getJson("/projects", context);
    const projects = extractArray(payload, "projects");
    const first = optionalRecord(projects[0]);
    return {
      profile: {
        accountId: optionalString(first?.key) ?? "api_key",
        displayName: optionalString(first?.name) ?? "Chattermill API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        validationEndpoint: "/projects",
        projectCount: projects.length,
        firstProjectKey: optionalString(first?.key),
      }),
    };
  },
};

async function listFamily(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  family: readonly [string, string, string],
): Promise<unknown> {
  const raw = await getJson(`/${encodeURIComponent(requiredString(input.project, "project"))}/${family[0]}`, context);
  return { [family[1]]: extractArray(raw, family[0]), raw };
}

async function getFamily(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  family: readonly [string, string, string],
): Promise<unknown> {
  return getWrapped(
    `/${encodeURIComponent(requiredString(input.project, "project"))}/${family[0]}/${encodeURIComponent(requiredString(input.id, "id"))}`,
    family[2],
    context,
  );
}

async function getWrapped(path: string, key: string, context: ApiKeyProviderContext): Promise<unknown> {
  const raw = await getJson(path, context);
  return { [key]: optionalRecord(optionalRecord(raw)?.[key]) ?? optionalRecord(raw) ?? {}, raw };
}

function writeResponse(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  method: "POST" | "PUT",
): Promise<unknown> {
  const responseId = method === "PUT" ? `/${encodeURIComponent(requiredString(input.responseId, "responseId"))}` : "";
  return requestJson(
    `/${encodeURIComponent(requiredString(input.project, "project"))}/responses${responseId}`,
    context,
    {
      method,
      body: { response: optionalRecord(input.response) ?? {} },
    },
  ).then((raw) => ({ response: optionalRecord(optionalRecord(raw)?.response) ?? null, raw }));
}

function responseQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    page: input.page,
    per_page: input.perPage,
    from: input.from,
    to: input.to,
    data_type: input.dataType,
    data_source: input.dataSource,
    filter_property: input.filterProperty,
    filter_value: input.filterValue,
    text_analytics_processed: input.textAnalyticsProcessed,
    comment_present: input.commentPresent,
    score_from: input.scoreFrom,
    score_to: input.scoreTo,
    custom_segment_id: input.customSegmentId,
    theme_id: input.themeId,
    updated_from: input.updatedFrom,
    updated_to: input.updatedTo,
    response_id: input.responseId,
    user_meta_property: input.userMetaProperty,
    user_meta_value: input.userMetaValue,
  });
}

function getJson(
  path: string,
  context: ApiKeyProviderContext,
  options: { query?: Record<string, unknown> } = {},
): Promise<unknown> {
  return requestJson(path, context, { ...options, method: "GET" });
}

async function requestJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; query?: Record<string, unknown>; body?: unknown } = {},
): Promise<unknown> {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(queryParams((options.query ?? {}) as Record<string, QueryValue>))) {
    url.searchParams.set(key, value);
  }
  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(compactJson(options.body)),
    signal: context.signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) throw createError(response, payload);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return text;
    throw new ProviderRequestError(502, "Chattermill returned invalid JSON");
  }
}

function extractArray(payload: unknown, key: string): unknown[] {
  const value = optionalRecord(payload)?.[key];
  return Array.isArray(value) ? value : [];
}

function createError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    response.statusText ??
    `Chattermill request failed with HTTP ${response.status}`;
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}
