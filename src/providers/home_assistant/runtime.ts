import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { queryFlag, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const homeAssistantRequestTimeoutMs = 30_000;

/** Input guard failures surface as 400s, matching the other Home Assistant input checks. */
export function badHomeAssistantRequest(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export interface HomeAssistantActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export type HomeAssistantActionHandler = (
  input: Record<string, unknown>,
  context: HomeAssistantActionContext,
) => Promise<unknown>;

export const homeAssistantActionHandlers: Record<string, HomeAssistantActionHandler> = {
  async get_config(_input, context) {
    return {
      config: await requestHomeAssistantJson({
        context,
        path: "/api/config",
        method: "GET",
      }),
    };
  },
  async list_states(_input, context) {
    return {
      states: await requestHomeAssistantJson({
        context,
        path: "/api/states",
        method: "GET",
      }),
    };
  },
  async get_state(input, context) {
    return {
      state: await requestHomeAssistantJson({
        context,
        path: `/api/states/${encodeURIComponent(readInputString(input.entityId, "entityId"))}`,
        method: "GET",
      }),
    };
  },
  async list_services(_input, context) {
    return {
      services: await requestHomeAssistantJson({
        context,
        path: "/api/services",
        method: "GET",
      }),
    };
  },
  async call_service(input, context) {
    const query = input.returnResponse === true ? { return_response: "true" } : undefined;
    const payload = await requestHomeAssistantJson({
      context,
      path: `/api/services/${encodeURIComponent(readInputString(input.domain, "domain"))}/${encodeURIComponent(
        readInputString(input.service, "service"),
      )}`,
      method: "POST",
      body: optionalRecord(input.serviceData) ?? {},
      query,
    });

    return normalizeServiceCallResponse(payload);
  },
  async list_events(_input, context) {
    return {
      events: await requestHomeAssistantJson({
        context,
        path: "/api/events",
        method: "GET",
      }),
    };
  },
  async fire_event(input, context) {
    return {
      response: await requestHomeAssistantJson({
        context,
        path: `/api/events/${encodeURIComponent(readInputString(input.eventType, "eventType"))}`,
        method: "POST",
        body: optionalRecord(input.eventData) ?? {},
      }),
    };
  },
  async render_template(input, context) {
    return {
      result: await requestHomeAssistantText({
        context,
        path: "/api/template",
        method: "POST",
        body: compactObject({
          template: readInputString(input.template, "template"),
          variables: optionalRecord(input.variables),
        }),
      }),
    };
  },
  async get_history(input, context) {
    const startTime = optionalString(input.startTime);
    return {
      history: await requestHomeAssistantJson({
        context,
        path: startTime ? `/api/history/period/${encodeURIComponent(startTime)}` : "/api/history/period",
        method: "GET",
        query: queryParams({
          filter_entity_id: readHistoryEntityIds(input.entityIds),
          end_time: optionalString(input.endTime),
          minimal_response: presenceFlag(input.minimalResponse),
          no_attributes: presenceFlag(input.noAttributes),
          skip_initial_state: presenceFlag(input.skipInitialState),
          significant_changes_only: queryFlag(optionalBoolean(input.significantChangesOnly)),
        }),
      }),
    };
  },
  async get_logbook(input, context) {
    const startTime = optionalString(input.startTime);
    const entityIds = optionalStringArray(input.entityIds);
    return {
      entries: await requestHomeAssistantJson({
        context,
        path: startTime ? `/api/logbook/${encodeURIComponent(startTime)}` : "/api/logbook",
        method: "GET",
        query: queryParams({
          entity: entityIds?.length ? entityIds.join(",") : undefined,
          end_time: optionalString(input.endTime),
          period: optionalInteger(input.period),
          context_id: optionalString(input.contextId),
        }),
      }),
    };
  },
  async list_calendars(_input, context) {
    return {
      calendars: await requestHomeAssistantJson({
        context,
        path: "/api/calendars",
        method: "GET",
      }),
    };
  },
  async list_calendar_events(input, context) {
    return {
      events: await requestHomeAssistantJson({
        context,
        path: `/api/calendars/${encodeURIComponent(readInputString(input.entityId, "entityId"))}`,
        method: "GET",
        query: queryParams({
          start: readInputString(input.start, "start"),
          end: readInputString(input.end, "end"),
        }),
      }),
    };
  },
  async get_error_log(_input, context) {
    try {
      return {
        log: await requestHomeAssistantText({
          context,
          path: "/api/error_log",
          method: "GET",
        }),
      };
    } catch (error) {
      // Home Assistant registers this view only when the instance runs with file
      // logging, so a 404 means the log is unavailable rather than the path being
      // wrong. Say that instead of surfacing a bare "Not Found".
      if (error instanceof ProviderRequestError && error.status === 404) {
        throw new ProviderRequestError(
          404,
          "This Home Assistant instance does not expose an error log. The endpoint exists only when Home Assistant is started with file logging enabled.",
        );
      }
      throw error;
    }
  },
};

/**
 * Encode a Home Assistant presence flag. These query parameters are read by
 * presence, not by value, so `false` must omit the parameter entirely rather
 * than send `0`.
 */
function presenceFlag(value: unknown): string | undefined {
  return optionalBoolean(value) === true ? "1" : undefined;
}

/**
 * Build the `filter_entity_id` value, rejecting an entity list that carries no
 * usable id.
 *
 * Home Assistant treats a missing `filter_entity_id` as "every entity", and
 * `queryParams` drops empty strings, so a list that normalizes to nothing would
 * turn a scoped query into a whole-instance history dump. The action schema
 * already requires at least one non-empty id, but the request must not depend on
 * that alone, and a whitespace-only id passes the schema while still being
 * unusable.
 */
function readHistoryEntityIds(value: unknown): string {
  const entityIds = requiredStringArray(value, "entityIds", badHomeAssistantRequest)
    .map((entityId) => entityId.trim())
    .filter((entityId) => entityId.length > 0);
  if (entityIds.length === 0) {
    throw badHomeAssistantRequest("entityIds must contain at least one entity id");
  }
  return entityIds.join(",");
}

export function validateHomeAssistantCredential(input: { values: Record<string, string> }): {
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
} {
  const baseUrl = normalizeBaseUrl(input.values.baseUrl);
  const host = new URL(baseUrl).host;
  return {
    profile: {
      accountId: `home_assistant:${host}`,
      displayName: `Home Assistant (${host})`,
    },
    grantedScopes: [],
    metadata: {
      baseUrl,
    },
  };
}

export function resolveHomeAssistantBaseUrl(input: {
  values?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): string {
  return normalizeBaseUrl(input.metadata?.baseUrl ?? input.values?.baseUrl);
}

/** One Home Assistant REST call, before the base URL and credential are applied. */
export interface HomeAssistantRequest {
  context: HomeAssistantActionContext;
  /** Path below the instance base URL, always starting with `/api`. */
  path: string;
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

/** Issue a Home Assistant REST call and parse the JSON body. */
export async function requestHomeAssistantJson(input: HomeAssistantRequest): Promise<unknown> {
  const response = await requestHomeAssistant(input);
  return readJsonResponse(response);
}

/** Issue a Home Assistant REST call and return the raw text body, for endpoints that are not JSON. */
export async function requestHomeAssistantText(input: HomeAssistantRequest): Promise<string> {
  const response = await requestHomeAssistant(input);
  return response.text();
}

async function requestHomeAssistant(input: HomeAssistantRequest): Promise<Response> {
  const timeout = createProviderTimeout(input.context.signal, homeAssistantRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildHomeAssistantUrl(input), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw createHomeAssistantError(response.status, await readErrorText(response));
    }

    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Home Assistant request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Unknown Home Assistant error", error);
  } finally {
    timeout.cleanup();
  }
}

function buildHomeAssistantUrl(input: {
  context: HomeAssistantActionContext;
  path: string;
  query?: Record<string, string>;
}): string {
  const url = new URL(input.context.baseUrl);
  // Append to the instance path instead of replacing it: normalizeBaseUrl keeps
  // a base path, so an instance behind a reverse proxy at /ha must reach
  // /ha/api/... rather than /api/....
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${input.path}`;
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Home Assistant returned invalid JSON");
  }
}

async function readErrorText(response: Response): Promise<string | undefined> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    const payload = JSON.parse(text) as unknown;
    return readHomeAssistantErrorMessage(payload) ?? text;
  } catch {
    return text;
  }
}

function createHomeAssistantError(status: number, message?: string): ProviderRequestError {
  const resolvedMessage = message?.trim() || `Home Assistant request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, resolvedMessage);
  }
  if (status === 400 || status === 404 || status === 405 || status === 422) {
    return new ProviderRequestError(status, resolvedMessage);
  }
  return new ProviderRequestError(status || 502, resolvedMessage);
}

function readHomeAssistantErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function normalizeServiceCallResponse(payload: unknown): {
  changedStates: unknown[];
  serviceResponse: Record<string, unknown> | null;
} {
  if (Array.isArray(payload)) {
    return {
      changedStates: payload,
      serviceResponse: null,
    };
  }
  const record = optionalRecord(payload);
  if (record) {
    return {
      changedStates: Array.isArray(record.changed_states) ? record.changed_states : [],
      serviceResponse: optionalRecord(record.service_response) ?? record,
    };
  }
  return {
    changedStates: [],
    serviceResponse: null,
  };
}

function normalizeBaseUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must be a valid http(s) URL");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError(400, "baseUrl must be a clean instance root URL");
  }

  const trimmedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = trimmedPath === "/api" ? "/" : trimmedPath || "/";
  return url.pathname === "/" ? url.origin : `${url.origin}${url.pathname}`;
}

/** Read a required string action input, reported as a 400 like the other input guards. */
export function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
