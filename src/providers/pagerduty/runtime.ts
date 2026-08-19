import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const pagerDutyApiBaseUrl = "https://api.pagerduty.com";
const pagerDutyAcceptHeader = "application/vnd.pagerduty+json;version=2";

type PagerDutyRequestPhase = "validate" | "execute";
type PagerDutyActionContext = ApiKeyProviderContext;
type PagerDutyActionHandler = (input: Record<string, unknown>, context: PagerDutyActionContext) => Promise<unknown>;

export const pagerDutyActionHandlers: ProviderActionHandlers<"pagerduty", PagerDutyActionHandler> = {
  list_incidents(input, context) {
    return listIncidents(input, context);
  },
  get_incident(input, context) {
    return getIncident(input, context);
  },
  update_incident(input, context) {
    return updateIncident(input, context);
  },
  acknowledge_incident(input, context) {
    return setIncidentStatus(input, context, "acknowledged");
  },
  resolve_incident(input, context) {
    return setIncidentStatus(input, context, "resolved");
  },
  list_on_calls(input, context) {
    return listOnCalls(input, context);
  },
  get_current_user(input, context) {
    return getCurrentUser(input, context);
  },
};

export async function validatePagerDutyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPagerDutyJson<Record<string, unknown>>({
    apiKey,
    path: "/users/me",
    fetcher,
    phase: "validate",
  });
  const user = requireObjectPayload(payload.user, "pagerduty current user response user");
  const providerAccountId = requireStringPayload(user.id, "pagerduty current user id");
  const accountLabel = optionalString(user.name) || optionalString(user.email) || providerAccountId;

  return {
    profile: {
      accountId: providerAccountId,
      displayName: accountLabel,
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: pagerDutyApiBaseUrl,
      validationEndpoint: "/users/me",
      userId: providerAccountId,
      userEmail: optionalString(user.email),
    }),
  };
}

async function listIncidents(input: Record<string, unknown>, context: PagerDutyActionContext) {
  const payload = await requestPagerDutyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/incidents",
    query: compactObject({
      ...arrayQuery("statuses[]", input.statuses),
      since: optionalString(input.since),
      until: optionalString(input.until),
      ...arrayQuery("service_ids[]", input.service_ids),
      ...arrayQuery("team_ids[]", input.team_ids),
      ...arrayQuery("user_ids[]", input.user_ids),
      ...arrayQuery("urgencies[]", input.urgencies),
      sort_by: optionalString(input.sort_by),
      ...arrayQuery("include[]", input.include),
      total: optionalBoolean(input.total),
      limit: optionalIntegerLike(input.limit, "limit"),
      offset: optionalIntegerLike(input.offset, "offset"),
    }),
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    incidents: requireArrayPayload(payload.incidents, "pagerduty incidents response incidents"),
    pagination: readPagination(payload),
  };
}

async function getIncident(input: Record<string, unknown>, context: PagerDutyActionContext) {
  const incidentId = requireInputString(input.incident_id, "incident_id");
  const payload = await requestPagerDutyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/incidents/${encodeURIComponent(incidentId)}`,
    query: compactObject({
      ...arrayQuery("include[]", input.include),
    }),
    fetcher: context.fetcher,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    incident: requireObjectPayload(payload.incident, "pagerduty incident response incident"),
  };
}

async function updateIncident(input: Record<string, unknown>, context: PagerDutyActionContext) {
  const incidentId = requireInputString(input.incident_id, "incident_id");
  const incident = requireObjectPayload(input.incident, "pagerduty update incident input");
  const payload = await requestPagerDutyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/incidents/${encodeURIComponent(incidentId)}`,
    method: "PUT",
    fromEmail: requireInputString(input.from, "from"),
    body: {
      incident: compactObject(incident),
    },
    fetcher: context.fetcher,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    incident: requireObjectPayload(payload.incident, "pagerduty update incident response incident"),
  };
}

async function setIncidentStatus(
  input: Record<string, unknown>,
  context: PagerDutyActionContext,
  status: "acknowledged" | "resolved",
) {
  const incidentId = requireInputString(input.incident_id, "incident_id");
  const bodyIncident = compactObject({
    type: "incident_reference",
    status,
    resolution: status === "resolved" ? optionalString(input.resolution) : undefined,
  });
  const payload = await requestPagerDutyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/incidents/${encodeURIComponent(incidentId)}`,
    method: "PUT",
    fromEmail: requireInputString(input.from, "from"),
    body: {
      incident: bodyIncident,
    },
    fetcher: context.fetcher,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    incident: requireObjectPayload(payload.incident, "pagerduty incident status response incident"),
  };
}

async function listOnCalls(input: Record<string, unknown>, context: PagerDutyActionContext) {
  const payload = await requestPagerDutyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/oncalls",
    query: compactObject({
      ...arrayQuery("user_ids[]", input.user_ids),
      ...arrayQuery("escalation_policy_ids[]", input.escalation_policy_ids),
      ...arrayQuery("schedule_ids[]", input.schedule_ids),
      since: optionalString(input.since),
      until: optionalString(input.until),
      earliest: optionalBoolean(input.earliest),
      ...arrayQuery("include[]", input.include),
      limit: optionalIntegerLike(input.limit, "limit"),
      offset: optionalIntegerLike(input.offset, "offset"),
    }),
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    onCalls: requireArrayPayload(payload.oncalls, "pagerduty on-calls response oncalls"),
    pagination: readPagination(payload),
  };
}

async function getCurrentUser(_input: Record<string, unknown>, context: PagerDutyActionContext) {
  const payload = await requestPagerDutyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/users/me",
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    user: requireObjectPayload(payload.user, "pagerduty current user response user"),
  };
}

async function requestPagerDutyJson<T>(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: PagerDutyRequestPhase;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  fromEmail?: string;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const url = new URL(input.path, pagerDutyApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryParam(url, key, value);
  }

  const headers = compactObject({
    accept: pagerDutyAcceptHeader,
    authorization: `Token token=${input.apiKey}`,
    "content-type": input.body === undefined ? undefined : "application/json",
    from: input.fromEmail,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
  } catch {
    throw new ProviderRequestError(502, "pagerduty request failed");
  }
  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw mapPagerDutyError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return requireObjectPayload(payload, "pagerduty response") as T;
}

function appendQueryParam(url: URL, key: string, value: unknown) {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(key, String(item));
    }
    return;
  }
  url.searchParams.set(key, String(value));
}

function arrayQuery(key: string, value: unknown) {
  if (!Array.isArray(value)) {
    return {};
  }

  return {
    [key]: value.map(String),
  };
}

async function readJsonPayload(response: Response) {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ProviderRequestError(502, "pagerduty response could not be read");
  }
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "pagerduty returned non-JSON response");
  }
}

function mapPagerDutyError(
  response: Response,
  payload: unknown,
  phase: PagerDutyRequestPhase,
  notFoundAsInvalidInput?: boolean,
) {
  const message = readErrorMessage(payload) ?? `PagerDuty request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500 && phase === "execute") {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function readErrorMessage(payload: unknown) {
  const body = asRecord(payload);
  const error = asRecord(body?.error);
  return (
    optionalString(error?.message) ||
    optionalString(body?.message) ||
    optionalString(body?.error) ||
    optionalString(body?.errors)
  );
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function requireObjectPayload(value: unknown, label: string) {
  const record = asRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing or invalid`);
  }
  return record;
}

function requireArrayPayload(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is missing or invalid`);
  }
  return value;
}

function requireStringPayload(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(502, `${label} is missing or invalid`);
  }
  return value;
}

function requireInputString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readPagination(payload: Record<string, unknown>) {
  return {
    limit: optionalIntegerLike(payload.limit, "limit") ?? 0,
    offset: optionalIntegerLike(payload.offset, "offset") ?? 0,
    more: optionalBoolean(payload.more) ?? false,
    ...(payload.total === undefined ? {} : { total: optionalIntegerLike(payload.total, "total") ?? 0 }),
  };
}
