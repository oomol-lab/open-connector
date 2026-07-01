import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FirehydrantActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "firehydrant";
const firehydrantApiBaseUrl = "https://api.firehydrant.io/v1";
const firehydrantRequestTimeoutMs = 30_000;

type RequestPhase = "validate" | "execute";
type FirehydrantContext = ApiKeyProviderContext;
type FirehydrantHandler = (input: Record<string, unknown>, context: FirehydrantContext) => Promise<unknown>;

interface FirehydrantRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

export const firehydrantActionHandlers: Record<FirehydrantActionName, FirehydrantHandler> = {
  list_incidents(input, context) {
    return listCollection("incidents", "/incidents", input, context, normalizeIncident);
  },
  get_incident(input, context) {
    return getSingle(
      "incident",
      `/incidents/${encodePathSegment(input.incidentId, "incidentId")}`,
      context,
      normalizeIncident,
    );
  },
  create_incident(input, context) {
    return getSingle("incident", "/incidents", context, normalizeIncident, "POST", buildCreateIncidentBody(input));
  },
  list_services(input, context) {
    return listCollection("services", "/services", input, context, normalizeCatalogEntry);
  },
  get_service(input, context) {
    return getSingle(
      "service",
      `/services/${encodePathSegment(input.serviceId, "serviceId")}`,
      context,
      normalizeCatalogEntry,
    );
  },
  list_environments(input, context) {
    return listCollection("environments", "/environments", input, context, normalizeCatalogEntry);
  },
  get_environment(input, context) {
    return getSingle(
      "environment",
      `/environments/${encodePathSegment(input.environmentId, "environmentId")}`,
      context,
      normalizeCatalogEntry,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, firehydrantActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson({
      apiKey: input.apiKey,
      path: "/incidents",
      query: { per_page: "1" },
      fetcher,
      signal,
      phase: "validate",
    });
    const record = asResponseObject(payload, "FireHydrant validation response");
    const incidents = readArray(record.data);
    const firstIncident = incidents
      .map((incident) => asResponseObject(incident, "FireHydrant incident"))
      .find((incident) => optionalString(incident.name));

    return {
      profile: {
        accountId: "api_key",
        displayName: firstIncident ? `FireHydrant: ${String(firstIncident.name)}` : "FireHydrant API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: firehydrantApiBaseUrl,
        validationEndpoint: "/incidents",
        validationIncidentCount: incidents.length,
        firstIncidentId: firstIncident ? optionalString(firstIncident.id) : undefined,
        firstIncidentName: firstIncident ? optionalString(firstIncident.name) : undefined,
      }),
    };
  },
};

async function listCollection(
  outputKey: "incidents" | "services" | "environments",
  path: string,
  input: Record<string, unknown>,
  context: FirehydrantContext,
  normalizeItem: (item: Record<string, unknown>) => Record<string, unknown>,
): Promise<unknown> {
  const raw = asResponseObject(
    await requestJson({
      ...context,
      path,
      query: buildListQuery(input),
      phase: "execute",
    }),
    `FireHydrant ${outputKey} list response`,
  );
  const items = readArray(raw.data).map((item) =>
    normalizeItem(asResponseObject(item, `FireHydrant ${outputKey} list item`)),
  );

  return {
    [outputKey]: items,
    pagination: normalizePagination(raw.pagination),
    raw,
  };
}

async function getSingle(
  outputKey: "incident" | "service" | "environment",
  path: string,
  context: FirehydrantContext,
  normalizeItem: (item: Record<string, unknown>) => Record<string, unknown>,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const raw = asResponseObject(
    await requestJson({
      ...context,
      path,
      method,
      body,
      phase: "execute",
    }),
    `FireHydrant ${outputKey} response`,
  );
  return {
    [outputKey]: normalizeItem(raw),
    raw,
  };
}

function buildListQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    page: input.page == null ? undefined : String(input.page),
    per_page: input.perPage == null ? undefined : String(input.perPage),
    query: optionalString(input.query),
    name: optionalString(input.name),
    status: optionalString(input.status),
    services: optionalString(input.services),
    environments: optionalString(input.environments),
    tags: optionalString(input.tags),
    tag_match_strategy: optionalString(input.tagMatchStrategy),
    archived: input.archived == null ? undefined : String(input.archived),
    created_at_or_after: optionalString(input.createdAtOrAfter),
    created_at_or_before: optionalString(input.createdAtOrBefore),
    updated_after: optionalString(input.updatedAfter),
    updated_before: optionalString(input.updatedBefore),
  });
}

function buildCreateIncidentBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    summary: input.summary,
    customer_impact_summary: input.customerImpactSummary,
    description: input.description,
    priority: input.priority,
    severity: input.severity,
    severity_condition_id: input.severityConditionId,
    severity_impact_id: input.severityImpactId,
    labels: input.labels,
    tag_list: input.tagList,
    impacts: Array.isArray(input.impacts)
      ? input.impacts.map((impact) => {
          const record = requiredRecord(impact, "impact", (message) => new ProviderRequestError(400, message));
          return {
            type: record.type,
            id: record.id,
            condition_id: record.conditionId,
          };
        })
      : undefined,
    team_ids: input.teamIds,
    restricted: input.restricted,
    incident_type_id: input.incidentTypeId,
    skip_incident_type_values: input.skipIncidentTypeValues,
  });
}

function normalizeIncident(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableString(record.id),
    name: nullableString(record.name),
    number: nullableInteger(record.number),
    summary: nullableString(record.summary),
    description: nullableString(record.description),
    customerImpactSummary: nullableString(record.customer_impact_summary),
    currentMilestone: nullableString(record.current_milestone),
    severity: nullableString(record.severity),
    priority: nullableString(record.priority),
    createdAt: nullableString(record.created_at),
    startedAt: nullableString(record.started_at),
    updatedAt: nullableString(record.updated_at),
    incidentUrl: nullableString(record.incident_url),
    active: nullableBoolean(record.active),
    restricted: nullableBoolean(record.restricted),
    services: readArray(record.services).map((item) =>
      normalizeEntityRef(asResponseObject(item, "FireHydrant incident service")),
    ),
    environments: readArray(record.environments).map((item) =>
      normalizeEntityRef(asResponseObject(item, "FireHydrant incident environment")),
    ),
    tags: readArray(record.tag_list).map(String),
    labels: normalizeLabels(record.labels),
    raw: record,
  };
}

function normalizeCatalogEntry(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableString(record.id),
    name: nullableString(record.name),
    slug: nullableString(record.slug),
    description: nullableString(record.description),
    serviceTier: nullableInteger(record.service_tier),
    createdAt: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
    activeIncidents: readArray(record.active_incidents).map(String),
    labels: normalizeLabels(record.labels),
    owner: normalizeNullableEntityRef(record.owner),
    raw: record,
  };
}

function normalizeEntityRef(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableString(record.id),
    name: nullableString(record.name),
    slug: nullableString(record.slug),
    raw: record,
  };
}

function normalizeNullableEntityRef(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  return record ? normalizeEntityRef(record) : null;
}

function normalizePagination(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    count: nullableInteger(record.count),
    page: nullableInteger(record.page),
    items: nullableInteger(record.items),
    pages: nullableInteger(record.pages),
    last: nullableInteger(record.last),
    prev: nullableInteger(record.prev),
    next: nullableInteger(record.next),
    raw: record,
  };
}

function normalizeLabels(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalInteger(value) ?? null;
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalBoolean(value) ?? null;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function encodePathSegment(value: unknown, fieldName: string): string {
  const segment = optionalString(value);
  if (!segment) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(segment);
}

async function requestJson(input: FirehydrantRequestInput): Promise<unknown> {
  const url = new URL(`${firehydrantApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeoutSignal = AbortSignal.timeout(firehydrantRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !input.signal?.aborted) {
      throw new ProviderRequestError(input.phase === "validate" ? 400 : 504, "FireHydrant request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      input.phase === "validate" ? 400 : 502,
      `FireHydrant request failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }

  const text = await response.text();
  const payload = text ? parseJson(text) : {};
  if (!response.ok) {
    throw mapFirehydrantError(response.status, payload, input.phase);
  }
  return payload;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "FireHydrant returned invalid JSON");
  }
}

function asResponseObject(value: unknown, context: string): Record<string, unknown> {
  return requiredRecord(value, context, () => new ProviderRequestError(502, `${context} must be an object`));
}

function mapFirehydrantError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `FireHydrant request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = optionalString(record.error) ?? optionalString(record.message);
  if (direct) {
    return direct;
  }

  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map(String).join(", ");
  }

  return undefined;
}
