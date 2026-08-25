import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, stringArray } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "incident_io";
const incidentIoApiBaseUrl = "https://api.incident.io";
const requestTimeoutMs = 30_000;

type RequestPhase = "validate" | "execute";
type IncidentIoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IncidentIoActionHandler = (input: Record<string, unknown>, context: IncidentIoActionContext) => Promise<unknown>;

interface IncidentIoRequestInput {
  path: string;
  query?: Record<string, string | undefined>;
  phase: RequestPhase;
}

export const incidentIoActionHandlers: ProviderActionHandlers<"incident_io", IncidentIoActionHandler> = {
  list_incidents(input, context) {
    return listIncidents(input, context);
  },
  get_incident(input, context) {
    return getIncident(input, context);
  },
  list_actions(input, context) {
    return listActions(input, context);
  },
  get_action(input, context) {
    return getAction(input, context);
  },
  list_severities(_input, context) {
    return listSeverities(context);
  },
  list_incident_statuses(_input, context) {
    return listIncidentStatuses(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, incidentIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestJson(
      {
        path: "/v2/incidents",
        query: { page_size: "1" },
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const record = requireObject(payload, "incident.io validation response");
    const incidents = requireArray(record.incidents, "incidents");

    return {
      profile: {
        accountId: "api_key",
        displayName: "incident.io API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: incidentIoApiBaseUrl,
        validationEndpoint: "/v2/incidents",
        validationIncidentCount: incidents.length,
      }),
    };
  },
};

async function listIncidents(input: Record<string, unknown>, context: IncidentIoActionContext): Promise<unknown> {
  const payload = await requestJson(
    {
      path: "/v2/incidents",
      query: buildListIncidentsQuery(input),
      phase: "execute",
    },
    context,
  );
  const record = requireObject(payload, "incident.io incidents response");
  return {
    incidents: requireArray(record.incidents, "incidents").map(normalizeIncident),
    paginationMeta: normalizePaginationMeta(record.pagination_meta),
  };
}

async function getIncident(input: Record<string, unknown>, context: IncidentIoActionContext): Promise<unknown> {
  const payload = await requestJson(
    {
      path: `/v2/incidents/${encodeURIComponent(readRequiredInputString(input.id, "id"))}`,
      phase: "execute",
    },
    context,
  );
  const record = requireObject(payload, "incident.io incident response");
  return {
    incident: normalizeIncident(requireObject(record.incident, "incident")),
  };
}

async function listActions(input: Record<string, unknown>, context: IncidentIoActionContext): Promise<unknown> {
  const payload = await requestJson(
    {
      path: "/v2/actions",
      query: compactObject({
        incident_id: optionalString(input.incidentId),
        incident_mode: optionalString(input.incidentMode),
      }),
      phase: "execute",
    },
    context,
  );
  const record = requireObject(payload, "incident.io actions response");
  return {
    actions: requireArray(record.actions, "actions").map(normalizeAction),
  };
}

async function getAction(input: Record<string, unknown>, context: IncidentIoActionContext): Promise<unknown> {
  const payload = await requestJson(
    {
      path: `/v2/actions/${encodeURIComponent(readRequiredInputString(input.id, "id"))}`,
      phase: "execute",
    },
    context,
  );
  const record = requireObject(payload, "incident.io action response");
  return {
    action: normalizeAction(requireObject(record.action, "action")),
  };
}

async function listSeverities(context: IncidentIoActionContext): Promise<unknown> {
  const payload = await requestJson(
    {
      path: "/v1/severities",
      phase: "execute",
    },
    context,
  );
  const record = requireObject(payload, "incident.io severities response");
  return {
    severities: requireArray(record.severities, "severities").map(normalizeSeverity),
  };
}

async function listIncidentStatuses(context: IncidentIoActionContext): Promise<unknown> {
  const payload = await requestJson(
    {
      path: "/v1/incident_statuses",
      phase: "execute",
    },
    context,
  );
  const record = requireObject(payload, "incident.io statuses response");
  return {
    incidentStatuses: requireArray(record.incident_statuses, "incident_statuses").map(normalizeIncidentStatus),
  };
}

function buildListIncidentsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = compactObject({
    page_size: stringifyOptionalNumber(optionalInteger(input.pageSize)),
    after: optionalString(input.after),
    sort_by: optionalString(input.sortBy),
    filter_mode: optionalString(input.filterMode),
    "status_category[one_of]": optionalString(input.statusCategoryOneOf),
    "status_category[not_in]": optionalString(input.statusCategoryNotIn),
    "severity[one_of]": optionalString(input.severityOneOf),
    "severity[gte]": optionalString(input.severityGte),
    "severity[lte]": optionalString(input.severityLte),
    "incident_type[one_of]": optionalString(input.incidentTypeOneOf),
  });
  if (Array.isArray(input.modeOneOf)) {
    query["mode[one_of]"] = stringArray(input.modeOneOf, "modeOneOf").join(",");
  }
  return query;
}

async function requestJson(input: IncidentIoRequestInput, context: IncidentIoActionContext): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  try {
    const response = await context.fetcher(buildUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw createIncidentIoError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "incident.io request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `incident.io request failed: ${error.message}` : "incident.io request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, incidentIoApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (key === "mode[one_of]" && value.includes(",")) {
      for (const item of value.split(",")) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "incident.io returned invalid JSON");
  }
}

function normalizeIncident(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "incident");
  const status = optionalRecord(record.incident_status);
  const severity = optionalRecord(record.severity);
  return {
    id: requireString(record.id, "incident id"),
    reference: optionalString(record.reference) ?? null,
    name: optionalString(record.name) ?? null,
    summary: optionalString(record.summary) ?? null,
    permalink: optionalString(record.permalink) ?? null,
    statusCategory: optionalString(status?.category) ?? null,
    statusName: optionalString(status?.name) ?? null,
    severityName: optionalString(severity?.name) ?? null,
    mode: optionalString(record.mode) ?? null,
    visibility: optionalString(record.visibility) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    raw: record,
  };
}

function normalizeAction(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "action");
  const assignee = optionalRecord(record.assignee);
  return {
    id: requireString(record.id, "action id"),
    incidentId: requireString(record.incident_id, "action incident_id"),
    description: requireString(record.description, "action description"),
    status: requireString(record.status, "action status"),
    assigneeName: optionalString(assignee?.name) ?? null,
    assigneeEmail: optionalString(assignee?.email) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    completedAt: optionalString(record.completed_at) ?? null,
    raw: record,
  };
}

function normalizeSeverity(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "severity");
  return {
    id: requireString(record.id, "severity id"),
    name: requireString(record.name, "severity name"),
    description: requireString(record.description, "severity description"),
    rank: requireInteger(record.rank, "severity rank"),
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    raw: record,
  };
}

function normalizeIncidentStatus(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "incident status");
  return {
    id: requireString(record.id, "incident status id"),
    name: requireString(record.name, "incident status name"),
    description: requireString(record.description, "incident status description"),
    category: requireString(record.category, "incident status category"),
    rank: requireInteger(record.rank, "incident status rank"),
    createdAt: optionalString(record.created_at) ?? null,
    updatedAt: optionalString(record.updated_at) ?? null,
    raw: record,
  };
}

function normalizePaginationMeta(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    after: optionalString(record.after) ?? null,
    pageSize: optionalInteger(record.page_size) ?? null,
    totalRecordCount: optionalInteger(record.total_record_count) ?? null,
    raw: record,
  };
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `incident.io response did not include ${fieldName} array`);
  }
  return value;
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `incident.io response did not include ${fieldName} object`);
  }
  return record;
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `incident.io response did not include ${fieldName}`);
  }
  return parsed;
}

function requireInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `incident.io response did not include ${fieldName}`);
  }
  return parsed;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function stringifyOptionalNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function createIncidentIoError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `incident.io request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors : [];
  const firstError = optionalRecord(errors[0]);
  return (
    optionalString(firstError?.message) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.type)
  );
}
