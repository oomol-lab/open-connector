import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { InstatusActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const instatusApiBaseUrl = "https://api.instatus.com";

type InstatusRequestPhase = "validate" | "execute";

export interface InstatusActionContext extends ApiKeyProviderContext {
  apiKey: string;
  fetcher: typeof fetch;
}

interface InstatusActionHandler {
  (input: Record<string, unknown>, context: InstatusActionContext): Promise<unknown>;
}

export const instatusActionHandlers: Record<InstatusActionName, InstatusActionHandler> = {
  list_status_pages(input, context) {
    let query = paginationQuery(input);
    return requestList("/v2/pages", "statusPages", query, context, redactStatusPage);
  },
  list_components(input, context) {
    let query = paginationQuery(input);
    let path = `/v2/pages/${pathSegment(input.pageId)}/components`;
    return requestList(path, "components", query, context);
  },
  get_component(input, context) {
    let path = `/v2/pages/${pathSegment(input.pageId)}/components/${pathSegment(input.componentId)}`;
    return requestWrapped(path, "GET", "component", context);
  },
  create_component(input, context) {
    let path = `/v1/${pathSegment(input.pageId)}/components`;
    let body = compactFields(input, componentBodyFields);
    return requestWrapped(path, "POST", "component", context, body);
  },
  update_component(input, context) {
    let path = `/v2/pages/${pathSegment(input.pageId)}/components/${pathSegment(input.componentId)}`;
    let body = compactFields(input, componentUpdateBodyFields);
    return requestWrapped(path, "PUT", "component", context, body);
  },
  async delete_component(input, context) {
    let path = `/v1/${pathSegment(input.pageId)}/components/${pathSegment(input.componentId)}`;
    let payload = await requestInstatusJson(path, { method: "DELETE" }, context, "execute");
    return { deleted: true, id: extractDeletedId(payload) ?? String(input.componentId) };
  },
  list_incidents(input, context) {
    let query = paginationQuery(input);
    addStatusQuery(query, "status", input.statuses);
    addStatusQuery(query, "!status", input.excludedStatuses);
    let path = `/v1/${pathSegment(input.pageId)}/incidents`;
    return requestList(path, "incidents", query, context);
  },
  get_incident(input, context) {
    let path = `/v1/${pathSegment(input.pageId)}/incidents/${pathSegment(input.incidentId)}`;
    return requestWrapped(path, "GET", "incident", context);
  },
  create_incident(input, context) {
    let path = `/v1/${pathSegment(input.pageId)}/incidents`;
    let body = compactFields(input, incidentBodyFields);
    return requestWrapped(path, "POST", "incident", context, body);
  },
  update_incident(input, context) {
    let path = `/v1/${pathSegment(input.pageId)}/incidents/${pathSegment(input.incidentId)}`;
    let body = compactFields(input, incidentEditBodyFields);
    return requestWrapped(path, "PUT", "incident", context, body);
  },
  async delete_incident(input, context) {
    let path = `/v1/${pathSegment(input.pageId)}/incidents/${pathSegment(input.incidentId)}`;
    let payload = await requestInstatusJson(path, { method: "DELETE" }, context, "execute");
    return { deleted: true, id: extractDeletedId(payload) ?? String(input.incidentId) };
  },
  get_incident_update(input, context) {
    let path = incidentUpdatePath(input);
    return requestWrapped(path, "GET", "incidentUpdate", context);
  },
  create_incident_update(input, context) {
    let path = `/v1/${pathSegment(input.pageId)}/incidents/${pathSegment(input.incidentId)}/incident-updates`;
    let body = compactFields(input, incidentUpdateBodyFields);
    return requestWrapped(path, "POST", "incidentUpdate", context, body);
  },
  update_incident_update(input, context) {
    let path = incidentUpdatePath(input);
    let body = compactFields(input, incidentUpdateBodyFields);
    return requestWrapped(path, "PUT", "incidentUpdate", context, body);
  },
  async delete_incident_update(input, context) {
    let path = incidentUpdatePath(input);
    let payload = await requestInstatusJson(path, { method: "DELETE" }, context, "execute");
    return { deleted: true, id: extractDeletedId(payload) ?? String(input.incidentUpdateId) };
  },
};

let componentBodyFields = [
  "name",
  "description",
  "status",
  "order",
  "showUptime",
  "grouped",
  "group",
  "archived",
  "translations",
];
let componentUpdateBodyFields = [
  "name",
  "description",
  "status",
  "order",
  "showUptime",
  "grouped",
  "archived",
  "translations",
];
let incidentBodyFields = [
  "name",
  "message",
  "components",
  "started",
  "status",
  "notify",
  "shouldPublish",
  "statuses",
  "translations",
];
let incidentEditBodyFields = ["name", "components", "started", "status", "notify", "statuses", "translations"];
let incidentUpdateBodyFields = ["message", "components", "started", "status", "notify", "statuses", "translations"];

export async function validateInstatusCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  let apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  let payload = await requestInstatusJson("/v1/user", { method: "GET" }, { apiKey, fetcher, signal }, "validate");
  let profile = optionalRecord(payload);
  let email = optionalString(profile?.email);
  let name = optionalString(profile?.name);

  return {
    profile: {
      accountId: optionalString(profile?.id) ?? email ?? "instatus:api_key",
      displayName: name ?? email ?? "Instatus API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: instatusApiBaseUrl,
      userId: optionalString(profile?.id),
      email,
      slug: optionalString(profile?.slug),
    }),
  };
}

async function requestList(
  path: string,
  outputKey: string,
  query: URLSearchParams,
  context: InstatusActionContext,
  mapItem?: (value: unknown) => unknown,
) {
  let payload = await requestInstatusJson(path, { method: "GET", query }, context, "execute");
  let items = Array.isArray(payload) ? payload : [];
  return { [outputKey]: mapItem ? items.map(mapItem) : items };
}

function redactStatusPage(value: unknown) {
  let record = optionalRecord(value);
  if (!record) {
    return value;
  }
  let publicPage = { ...record };
  delete publicPage.secureLink;
  return publicPage;
}

async function requestWrapped(
  path: string,
  method: string,
  outputKey: string,
  context: InstatusActionContext,
  body?: Record<string, unknown>,
) {
  let payload = await requestInstatusJson(path, { method, body }, context, "execute");
  return { [outputKey]: payload };
}

async function requestInstatusJson(
  path: string,
  input: { method: string; query?: URLSearchParams; body?: Record<string, unknown> },
  context: InstatusActionContext,
  phase: InstatusRequestPhase,
) {
  let url = new URL(path, instatusApiBaseUrl);
  if (input.query) {
    for (let [key, value] of input.query) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers: instatusHeaders(context.apiKey, input.body !== undefined),
      signal: context.signal,
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
    payload = await readInstatusPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `instatus request failed: ${error.message}` : "instatus request failed",
    );
  }

  if (!response.ok) {
    throw createInstatusError(response, payload, phase);
  }

  return payload;
}

function instatusHeaders(apiKey: string, hasBody: boolean) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readInstatusPayload(response: Response) {
  let text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createInstatusError(response: Response, payload: unknown, phase: InstatusRequestPhase) {
  let message = extractInstatusErrorMessage(payload) ?? response.statusText ?? "instatus request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractInstatusErrorMessage(payload: unknown) {
  if (typeof payload == "string" && payload.trim()) {
    return payload;
  }

  let record = optionalRecord(payload);
  let error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function paginationQuery(input: Record<string, unknown>) {
  let query = new URLSearchParams();
  if (typeof input.page == "number") {
    query.set("page", String(input.page));
  }
  if (typeof input.perPage == "number") {
    query.set("per_page", String(input.perPage));
  }
  return query;
}

function addStatusQuery(query: URLSearchParams, name: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return;
  }

  query.set(name, value.map((item) => String(item)).join(","));
}

function compactFields(input: Record<string, unknown>, fields: readonly string[]) {
  let output: Record<string, unknown> = {};
  for (let field of fields) {
    if (input[field] !== undefined) {
      output[field] = input[field];
    }
  }
  return output;
}

function incidentUpdatePath(input: Record<string, unknown>) {
  return `/v1/${pathSegment(input.pageId)}/incidents/${pathSegment(
    input.incidentId,
  )}/incident-updates/${pathSegment(input.incidentUpdateId)}`;
}

function pathSegment(value: unknown) {
  return encodeURIComponent(String(value));
}

function extractDeletedId(payload: unknown) {
  let record = optionalRecord(payload);
  return optionalString(record?.id);
}
