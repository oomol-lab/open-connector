import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BetterStackActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const betterStackApiBaseUrl = "https://uptime.betterstack.com";
const betterStackValidationPath = "/api/v3/incidents";

type BetterStackRequestPhase = "validate" | "execute";
type BetterStackContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BetterStackActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const betterStackActionHandlers: Record<BetterStackActionName, BetterStackActionHandler> = {
  list_incidents(input, context) {
    return listIncidents(input, context);
  },
  get_incident(input, context) {
    return getIncident(input, context);
  },
  create_incident(input, context) {
    return createIncident(input, context);
  },
  acknowledge_incident(input, context) {
    return acknowledgeIncident(input, context);
  },
  escalate_incident(input, context) {
    return escalateIncident(input, context);
  },
  list_incident_comments(input, context) {
    return listIncidentComments(input, context);
  },
  list_metadata(input, context) {
    return listMetadata(input, context);
  },
};

export async function validateBetterStackCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBetterStackJson({
    context: {
      apiKey,
      fetcher,
      signal,
    },
    path: betterStackValidationPath,
    query: {
      per_page: 1,
    },
    phase: "validate",
  });
  const body = requireObjectPayload(payload, "better_stack incidents response");
  const incidents = requireArrayPayload(body.data, "better_stack incidents response data");
  const firstIncident = optionalRecord(incidents[0]);
  const firstAttributes = optionalRecord(firstIncident?.attributes);
  const sampleTeamName = optionalString(firstAttributes?.team_name);

  return {
    profile: {
      accountId: sampleTeamName ?? "better_stack",
      displayName: sampleTeamName ? `Better Stack (${sampleTeamName})` : "Better Stack API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: betterStackApiBaseUrl,
      validationEndpoint: "/api/v3/incidents?per_page=1",
      sampleIncidentCount: incidents.length,
      sampleTeamName,
    }),
  };
}

async function listIncidents(
  input: Record<string, unknown>,
  context: BetterStackContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBetterStackJson({
    context,
    path: "/api/v3/incidents",
    query: compactObject({
      team_name: optionalString(input.team_name),
      from: optionalString(input.from),
      to: optionalString(input.to),
      monitor_id: optionalPositiveInteger(input.monitor_id, "monitor_id"),
      heartbeat_id: optionalPositiveInteger(input.heartbeat_id, "heartbeat_id"),
      resolved: optionalBoolean(input.resolved),
      acknowledged: optionalBoolean(input.acknowledged),
      page: optionalPositiveInteger(input.page, "page"),
      per_page: optionalPositiveInteger(input.per_page, "per_page"),
    }),
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "better_stack incidents response");

  return {
    incidents: requireArrayPayload(body.data, "better_stack incidents response data"),
    pagination: readPagination(body.pagination),
  };
}

async function getIncident(
  input: Record<string, unknown>,
  context: BetterStackContext,
): Promise<Record<string, unknown>> {
  const incidentId = requireInputString(input.incident_id, "incident_id");
  const payload = await requestBetterStackJson({
    context,
    path: `/api/v3/incidents/${encodeURIComponent(incidentId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const body = requireObjectPayload(payload, "better_stack incident response");

  return {
    incident: requireObjectPayload(body.data, "better_stack incident resource"),
    included: optionalRecord(body.included) ?? null,
  };
}

async function createIncident(
  input: Record<string, unknown>,
  context: BetterStackContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBetterStackJson({
    context,
    path: "/api/v3/incidents",
    method: "POST",
    body: compactObject({
      team_name: optionalString(input.team_name),
      requester_email: optionalString(input.requester_email),
      name: optionalString(input.name),
      summary: requireInputString(input.summary, "summary"),
      description: optionalString(input.description),
      call: optionalBoolean(input.call),
      sms: optionalBoolean(input.sms),
      email: optionalBoolean(input.email),
      critical_alert: optionalBoolean(input.critical_alert),
      team_wait: optionalPositiveInteger(input.team_wait, "team_wait"),
      policy_id: normalizeIdentifier(input.policy_id),
      metadata: optionalRecord(input.metadata),
    }),
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "better_stack create incident response");

  return {
    incident: requireObjectPayload(body.data, "better_stack incident resource"),
  };
}

async function acknowledgeIncident(
  input: Record<string, unknown>,
  context: BetterStackContext,
): Promise<Record<string, unknown>> {
  const incidentId = requireInputString(input.incident_id, "incident_id");
  const payload = await requestBetterStackJson({
    context,
    path: `/api/v3/incidents/${encodeURIComponent(incidentId)}/acknowledge`,
    method: "POST",
    body: compactObject({
      acknowledged_by: optionalString(input.acknowledged_by),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const body = requireObjectPayload(payload, "better_stack acknowledge incident response");

  return {
    incident: requireObjectPayload(body.data, "better_stack incident resource"),
  };
}

async function escalateIncident(
  input: Record<string, unknown>,
  context: BetterStackContext,
): Promise<Record<string, unknown>> {
  const incidentId = requireInputString(input.incident_id, "incident_id");
  const payload = await requestBetterStackJson({
    context,
    path: `/api/v3/incidents/${encodeURIComponent(incidentId)}/escalate`,
    method: "POST",
    body: compactObject({
      escalation_type: requireInputString(input.escalation_type, "escalation_type"),
      user_email: optionalString(input.user_email),
      user_id: optionalPositiveInteger(input.user_id, "user_id"),
      team_name: optionalString(input.team_name),
      team_id: optionalPositiveInteger(input.team_id, "team_id"),
      schedule_id: optionalPositiveInteger(input.schedule_id, "schedule_id"),
      policy_id: optionalPositiveInteger(input.policy_id, "policy_id"),
      call: optionalBoolean(input.call),
      sms: optionalBoolean(input.sms),
      email: optionalBoolean(input.email),
      push: optionalBoolean(input.push),
      critical_alert: optionalBoolean(input.critical_alert),
      metadata: optionalRecord(input.metadata),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const body = requireObjectPayload(payload, "better_stack escalate incident response");

  return {
    incident: requireObjectPayload(body.data, "better_stack incident resource"),
  };
}

async function listIncidentComments(
  input: Record<string, unknown>,
  context: BetterStackContext,
): Promise<Record<string, unknown>> {
  const incidentId = requireInputString(input.incident_id, "incident_id");
  const payload = await requestBetterStackJson({
    context,
    path: `/api/v2/incidents/${encodeURIComponent(incidentId)}/comments`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  const body = requireObjectPayload(payload, "better_stack incident comments response");

  return {
    comments: requireArrayPayload(body.data, "better_stack incident comments response data"),
  };
}

async function listMetadata(
  input: Record<string, unknown>,
  context: BetterStackContext,
): Promise<Record<string, unknown>> {
  const payload = await requestBetterStackJson({
    context,
    path: "/api/v3/metadata",
    query: compactObject({
      team_name: optionalString(input.team_name),
      owner_id: optionalString(input.owner_id),
      owner_type: optionalString(input.owner_type),
      page: optionalPositiveInteger(input.page, "page"),
      per_page: optionalPositiveInteger(input.per_page, "per_page"),
    }),
    phase: "execute",
  });
  const body = requireObjectPayload(payload, "better_stack metadata response");

  return {
    metadata: requireArrayPayload(body.data, "better_stack metadata response data"),
    pagination: readPagination(body.pagination),
  };
}

async function requestBetterStackJson(input: {
  context: BetterStackContext;
  path: string;
  phase: BetterStackRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await betterStackFetch(input);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `better_stack request failed: ${error.message}`
        : "better_stack request failed: Unknown transport error",
    );
  }

  const payload = await readBetterStackPayload(response);
  if (!response.ok) {
    throw createBetterStackError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload;
}

async function betterStackFetch(input: {
  context: BetterStackContext;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const url = new URL(input.path, betterStackApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return input.context.fetcher(url, {
    method: input.method ?? "GET",
    headers: betterStackHeaders(input.context.apiKey, input.body !== undefined),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.context.signal,
  });
}

function betterStackHeaders(apiKey: string, includeJsonBody: boolean): Headers {
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (includeJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readBetterStackPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      throw new ProviderRequestError(502, "better_stack returned invalid JSON");
    }
  }

  const text = await response.text();
  return text || null;
}

function createBetterStackError(
  response: Response,
  payload: unknown,
  phase: BetterStackRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message =
    extractBetterStackErrorMessage(payload) ?? `better_stack request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : response.status,
      phase === "validate" ? "Invalid Better Stack API token." : message,
      payload,
    );
  }

  if (response.status === 404 && !notFoundAsInvalidInput) {
    return new ProviderRequestError(502, message, payload);
  }

  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function extractBetterStackErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.errors) ??
    optionalString(record.detail);
  if (direct) {
    return direct;
  }

  if (!Array.isArray(record.errors)) {
    return undefined;
  }

  const messages = record.errors
    .map((item) => {
      if (typeof item === "string") {
        return optionalString(item);
      }
      const child = optionalRecord(item);
      return child
        ? (optionalString(child.message) ?? optionalString(child.detail) ?? optionalString(child.title))
        : undefined;
    })
    .filter((item): item is string => Boolean(item));
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
  return record;
}

function requireArrayPayload(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is not an array`);
  }
  return value;
}

function readPagination(value: unknown): Record<string, string | null> {
  const record = requireObjectPayload(value, "better_stack pagination");
  return {
    first: readNullableString(record.first),
    last: readNullableString(record.last),
    prev: readNullableString(record.prev),
    next: readNullableString(record.next),
  };
}

function readNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  const text = optionalString(value);
  if (text === undefined) {
    throw new ProviderRequestError(502, "better_stack returned an invalid pagination link");
  }
  return text;
}

function requireInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function normalizeIdentifier(value: unknown): string | number | undefined {
  if (typeof value === "number") {
    return value;
  }
  return optionalString(value);
}
