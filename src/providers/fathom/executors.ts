import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { FathomActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "fathom";
const fathomApiBaseUrl = "https://api.usefathom.com";
const fathomApiVersionPath = "/v1";
const fathomValidationPath = "/v1/account";

type FathomJsonPayload = Record<string, unknown> | unknown[];
type FathomRequestMode = "validate" | "execute";

interface FathomActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FathomRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  mode: FathomRequestMode;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, unknown>;
  form?: Record<string, unknown>;
  signal?: AbortSignal;
}

type FathomActionHandler = (input: Record<string, unknown>, context: FathomActionContext) => Promise<unknown>;

export const fathomActionHandlers: Record<FathomActionName, FathomActionHandler> = {
  get_account(_input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: fathomValidationPath,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  list_sites(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites`,
      query: paginationQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_site(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  create_site(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites`,
      method: "POST",
      form: siteForm(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  update_site(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}`,
      method: "POST",
      form: siteForm(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  list_events(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/events`,
      query: paginationQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_event(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/events/${encodeURIComponent(requireString(input.event_id, "event_id"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  create_event(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/events`,
      method: "POST",
      form: compactObject({
        name: optionalString(input.name),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  update_event(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/events/${encodeURIComponent(requireString(input.event_id, "event_id"))}`,
      method: "POST",
      form: compactObject({
        name: optionalString(input.name),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  list_milestones(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/milestones`,
      query: paginationQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_milestone(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/milestones/${encodeURIComponent(requireString(input.milestone_id, "milestone_id"))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  create_milestone(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/milestones`,
      method: "POST",
      form: milestoneForm(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  update_milestone(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/sites/${encodeURIComponent(requireString(input.site_id, "site_id"))}/milestones/${encodeURIComponent(requireString(input.milestone_id, "milestone_id"))}`,
      method: "POST",
      form: milestoneForm(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  run_aggregation(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/aggregations`,
      query: aggregationQuery(input),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
  get_current_visitors(input, context) {
    return requestFathomJson({
      apiKey: context.apiKey,
      path: `${fathomApiVersionPath}/current_visitors`,
      query: compactObject({
        site_id: requireString(input.site_id, "site_id"),
        detailed: optionalBoolean(input.detailed),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fathomActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestFathomJson({
      apiKey: input.apiKey,
      path: fathomValidationPath,
      fetcher,
      signal,
      mode: "validate",
    });

    if (Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Fathom returned an unexpected account payload");
    }

    const accountId = payload.id === undefined ? undefined : String(payload.id);
    const name = optionalString(payload.name);
    const email = optionalString(payload.email);

    return {
      profile: {
        accountId: accountId ? `fathom:account:${accountId}` : "fathom",
        displayName: name ?? email ?? "Fathom API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: fathomValidationPath,
        accountId,
        name,
        email,
      }),
    };
  },
};

async function requestFathomJson(input: FathomRequestOptions): Promise<FathomJsonPayload> {
  const response = await fathomFetch(input);
  if (!response.ok) {
    const payload = await parseOptionalFathomJson(response);
    throw toFathomError(response, payload, input.mode);
  }

  const payload = await parseOptionalFathomJson(response);
  if (payload) {
    return payload;
  }

  throw new ProviderRequestError(502, "Fathom returned an empty response body");
}

async function fathomFetch(input: FathomRequestOptions): Promise<Response> {
  const url = new URL(input.path, fathomApiBaseUrl);
  const method = input.method ?? "GET";
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url.searchParams, key, value);
  }

  const body = input.form === undefined ? undefined : formBody(input.form);

  try {
    return await input.fetcher(url, {
      method,
      headers: fathomHeaders(input.apiKey, body !== undefined),
      body,
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Fathom request failed for ${method} ${url.toString()}: ${message}`);
  }
}

function fathomHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(hasBody ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    "user-agent": providerUserAgent,
  };
}

function paginationQuery(input: Record<string, unknown>): Record<string, unknown> {
  if (input.starting_after && input.ending_before) {
    throw new ProviderRequestError(400, "ending_before cannot be combined with starting_after.");
  }

  return compactObject({
    limit: optionalInteger(input.limit),
    starting_after: optionalString(input.starting_after),
    ending_before: optionalString(input.ending_before),
  });
}

function siteForm(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    sharing: optionalString(input.sharing),
    share_password: optionalString(input.share_password),
    timezone: optionalString(input.timezone),
  });
}

function milestoneForm(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    milestone_date: optionalString(input.milestone_date),
  });
}

function aggregationQuery(input: Record<string, unknown>): Record<string, unknown> {
  const entity = requireString(input.entity, "entity");
  if (entity === "pageview" && !optionalString(input.entity_id)) {
    throw new ProviderRequestError(400, "entity_id is required for pageview reports.");
  }
  if (entity === "event") {
    if (!optionalString(input.site_id)) {
      throw new ProviderRequestError(400, "site_id is required for event reports.");
    }
    if (!optionalString(input.entity_name)) {
      throw new ProviderRequestError(400, "entity_name is required for event reports.");
    }
  }

  return compactObject({
    entity,
    entity_id: optionalString(input.entity_id),
    site_id: optionalString(input.site_id),
    entity_name: optionalString(input.entity_name),
    aggregates: joinStringArray(input.aggregates, "aggregates"),
    date_grouping: optionalString(input.date_grouping),
    field_grouping: joinOptionalStringArray(input.field_grouping),
    sort_by: optionalString(input.sort_by),
    timezone: optionalString(input.timezone),
    date_from: optionalString(input.date_from),
    date_to: optionalString(input.date_to),
    limit: optionalInteger(input.limit),
    filters: Array.isArray(input.filters) ? JSON.stringify(input.filters) : undefined,
  });
}

function formBody(input: Record<string, unknown>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    appendQueryValue(body, key, value);
  }
  return body.toString();
}

function appendQueryValue(target: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    target.set(key, value.join(","));
    return;
  }
  target.set(key, String(value));
}

function joinOptionalStringArray(value: unknown): string | undefined {
  return Array.isArray(value) ? joinStringArray(value, "field_grouping") : undefined;
}

function joinStringArray(value: unknown, fieldName: string): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty array`);
  }
  return value.map((item) => String(item)).join(",");
}

function requireString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

async function parseOptionalFathomJson(response: Response): Promise<FathomJsonPayload | undefined> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    throw new ProviderRequestError(502, "Fathom returned invalid JSON");
  }

  throw new ProviderRequestError(502, "Fathom returned an unexpected JSON payload");
}

function toFathomError(
  response: Response,
  payload: FathomJsonPayload | undefined,
  mode: FathomRequestMode,
): ProviderRequestError {
  const upstreamMessage = payload && !Array.isArray(payload) ? optionalString(payload.error) : undefined;
  const message = upstreamMessage ?? response.statusText;
  const fallbackMessage = message || `Fathom request failed with HTTP ${response.status}`;

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, fallbackMessage, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, fallbackMessage, payload);
  }

  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, fallbackMessage, payload);
  }

  return new ProviderRequestError(502, fallbackMessage, payload);
}
