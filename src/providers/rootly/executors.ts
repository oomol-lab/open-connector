import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "rootly";
const rootlyApiBaseUrl = "https://api.rootly.com/v1";
const jsonApiContentType = "application/vnd.api+json";

type RootlyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const rootlyActionHandlers: ProviderActionHandlers<"rootly", RootlyActionHandler> = {
  get_current_user(_input, context) {
    return rootlyGetSingleResource("/users/me", {}, context);
  },
  list_incidents(input, context) {
    return rootlyGetList("/incidents", buildIncidentQuery(input), context);
  },
  get_incident(input, context) {
    return rootlyGetSingleResource(
      `/incidents/${encodeURIComponent(readRequiredString(input, "id"))}`,
      buildIncludeQuery(input),
      context,
    );
  },
  list_services(input, context) {
    return rootlyGetList("/services", buildConfigurationQuery(input), context);
  },
  list_teams(input, context) {
    return rootlyGetList("/teams", buildConfigurationQuery(input, { includeColor: true }), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, rootlyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const response = await rootlyGetJson("/users/me", {}, { apiKey, fetcher, signal });
    const resource = readJsonApiResource(response, "Rootly current user");
    const attributes = optionalRecord(resource.attributes);
    const email = optionalString(attributes?.email);
    const fullName = optionalString(attributes?.full_name);
    return {
      profile: {
        accountId: `rootly:${resource.id}`,
        displayName: fullName || email || "Rootly API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: rootlyApiBaseUrl,
        validationEndpoint: "/users/me",
        userId: resource.id,
        userEmail: email,
        userFullName: fullName,
      },
    };
  },
};

async function rootlyGetSingleResource(
  path: string,
  query: Record<string, string>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const payload = await rootlyGetJson(path, query, context);
  return {
    resource: readJsonApiResource(payload, "Rootly resource"),
    ...readJsonApiSidecars(payload),
    raw: payload,
  };
}

async function rootlyGetList(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await rootlyGetJson(path, query, context);
  const object = readObject(payload, "Rootly list response");
  if (!Array.isArray(object.data)) {
    throw new ProviderRequestError(502, "Rootly list response did not include data array");
  }
  return {
    resources: object.data.map((item) => readJsonApiResource(item, "Rootly list resource")),
    ...readJsonApiSidecars(payload),
    raw: payload,
  };
}

async function rootlyGetJson(
  path: string,
  query: Record<string, string>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const url = new URL(`${rootlyApiBaseUrl}${path}`);
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: jsonApiContentType,
        authorization: `Bearer ${context.apiKey}`,
        "content-type": jsonApiContentType,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Rootly request failed: ${error.message}` : "Rootly request failed",
    );
  }

  const payload = await readRootlyPayload(response);
  if (response.ok) return payload;

  const errorMessage = readRootlyError(payload) ?? `Rootly request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) throw new ProviderRequestError(401, errorMessage, payload);
  if (response.status === 404) throw new ProviderRequestError(400, errorMessage, payload);
  if (response.status === 429) throw new ProviderRequestError(429, errorMessage, payload);
  throw new ProviderRequestError(response.status >= 500 ? 502 : 400, errorMessage, payload);
}

async function readRootlyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return { errors: [{ detail: text }] };
    throw new ProviderRequestError(502, "Rootly returned invalid JSON");
  }
}

function buildIncludeQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  const include = readOptionalStringArray(input.include);
  if (include && include.length > 0) query.include = include.join(",");
  return query;
}

function buildIncidentQuery(input: Record<string, unknown>): Record<string, string> {
  return compactQuery({
    ...buildPageQuery(input, { cursor: true }),
    "filter[search]": optionalString(input.search),
    "filter[kind]": optionalString(input.kind),
    "filter[status]": optionalString(input.status),
    "filter[private]": readOptionalBooleanString(input.private),
    "filter[user_id]": readOptionalNumberString(input.userId),
    "filter[severity]": optionalString(input.severity),
    "filter[severity_id]": optionalString(input.severityId),
    "filter[labels]": optionalString(input.labels),
    "filter[service_ids]": optionalString(input.serviceIds),
    "filter[service_names]": optionalString(input.serviceNames),
    "filter[team_ids]": optionalString(input.teamIds),
    "filter[team_names]": optionalString(input.teamNames),
    "filter[created_at][gt]": optionalString(input.createdAtGt),
    "filter[created_at][gte]": optionalString(input.createdAtGte),
    "filter[created_at][lt]": optionalString(input.createdAtLt),
    "filter[created_at][lte]": optionalString(input.createdAtLte),
    sort: optionalString(input.sort),
  });
}

function buildConfigurationQuery(
  input: Record<string, unknown>,
  options: { includeColor?: boolean } = {},
): Record<string, string> {
  return compactQuery({
    ...buildIncludeQuery(input),
    ...buildPageQuery(input),
    "filter[search]": optionalString(input.search),
    "filter[name]": optionalString(input.name),
    "filter[slug]": optionalString(input.slug),
    "filter[external_id]": optionalString(input.externalId),
    ...(options.includeColor ? { "filter[color]": optionalString(input.color) } : {}),
    "filter[alert_broadcast_enabled]": readOptionalBooleanString(input.alertBroadcastEnabled),
    "filter[incident_broadcast_enabled]": readOptionalBooleanString(input.incidentBroadcastEnabled),
    "filter[created_at][gt]": optionalString(input.createdAtGt),
    "filter[created_at][gte]": optionalString(input.createdAtGte),
    "filter[created_at][lt]": optionalString(input.createdAtLt),
    "filter[created_at][lte]": optionalString(input.createdAtLte),
    sort: optionalString(input.sort),
  });
}

function buildPageQuery(
  input: Record<string, unknown>,
  options: { cursor?: boolean } = {},
): Record<string, string | undefined> {
  return compactObject({
    ...(options.cursor ? { "page[after]": optionalString(input.pageAfter) } : {}),
    "page[number]": readOptionalNumberString(input.pageNumber),
    "page[size]": readOptionalNumberString(input.pageSize),
  });
}

function compactQuery(input: Record<string, string | undefined>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [name, value] of Object.entries(input)) {
    if (value !== undefined) output[name] = value;
  }
  return output;
}

function readJsonApiSidecars(payload: unknown): Record<string, unknown> {
  const object = readObject(payload, "Rootly response");
  return compactObject({
    included: Array.isArray(object.included) ? object.included : undefined,
    links: optionalRecord(object.links),
    meta: optionalRecord(object.meta),
  });
}

function readJsonApiResource(value: unknown, context: string): Record<string, unknown> & { id: string; type: string } {
  const object = readObject(value, context);
  const data = object.data === undefined ? object : readObject(object.data, `${context} data`);
  const id = optionalString(data.id);
  const type = optionalString(data.type);
  if (!id || !type) {
    throw new ProviderRequestError(502, `${context} did not include JSON:API id and type`);
  }
  return {
    ...data,
    id,
    type,
    attributes: optionalRecord(data.attributes) ?? {},
    relationships: optionalRecord(data.relationships) ?? {},
  };
}

function readObject(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${context} was not an object`);
  return record;
}

function readRequiredString(input: Record<string, unknown>, name: string): string {
  const value = optionalString(input[name]);
  if (!value) throw new ProviderRequestError(400, `missing rootly input field: ${name}`);
  return value;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}

function readOptionalNumberString(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}

function readOptionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function readRootlyError(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  const errors = Array.isArray(object?.errors) ? object.errors : [];
  const firstError = optionalRecord(errors[0]);
  return optionalString(firstError?.detail) || optionalString(firstError?.title);
}
