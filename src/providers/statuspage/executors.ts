import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { StatuspageActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "statuspage";
const statuspageApiBaseUrl = "https://api.statuspage.io/v1";
const statuspageApiOrigin = "https://api.statuspage.io";
const statuspageApiPrefix = "/v1";
const statuspageValidationPath = "/pages";

type StatuspageActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type Normalizer = (input: Record<string, unknown>) => Record<string, unknown>;

export const statuspageActionHandlers: Record<StatuspageActionName, StatuspageActionHandler> = {
  list_pages(_input, context) {
    return normalizeListOutput("pages", statuspageGetJson(statuspageValidationPath, context), normalizePage);
  },
  get_page(input, context) {
    return normalizeSingleOutput(
      "page",
      statuspageGetJson(`/pages/${readPathSegment(input.pageId, "pageId")}`, context),
      normalizePage,
    );
  },
  list_components(input, context) {
    return normalizeListOutput(
      "components",
      statuspageGetJson(`/pages/${readPathSegment(input.pageId, "pageId")}/components`, context),
      normalizeComponent,
    );
  },
  create_component(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    return normalizeSingleOutput(
      "component",
      statuspageRequestJson("POST", `/pages/${pageId}/components`, context, {
        component: buildComponentBody(readObject(input.component, "component")),
      }),
      normalizeComponent,
    );
  },
  update_component(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    const componentId = readPathSegment(input.componentId, "componentId");
    return normalizeSingleOutput(
      "component",
      statuspageRequestJson("PATCH", `/pages/${pageId}/components/${componentId}`, context, {
        component: buildComponentBody(readObject(input.component, "component")),
      }),
      normalizeComponent,
    );
  },
  delete_component(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    const componentId = readPathSegment(input.componentId, "componentId");
    return normalizeDeleteOutput(
      statuspageRequestJson("DELETE", `/pages/${pageId}/components/${componentId}`, context),
    );
  },
  list_incidents(input, context) {
    return normalizeListOutput(
      "incidents",
      statuspageGetJson(`/pages/${readPathSegment(input.pageId, "pageId")}/incidents`, context, {
        limit: input.limit,
        page: input.page,
        q: input.q,
      }),
      normalizeIncident,
    );
  },
  get_incident(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    const incidentId = readPathSegment(input.incidentId, "incidentId");
    return normalizeSingleOutput(
      "incident",
      statuspageGetJson(`/pages/${pageId}/incidents/${incidentId}`, context),
      normalizeIncident,
    );
  },
  create_incident(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    return normalizeSingleOutput(
      "incident",
      statuspageRequestJson("POST", `/pages/${pageId}/incidents`, context, {
        incident: buildIncidentBody(readObject(input.incident, "incident")),
      }),
      normalizeIncident,
    );
  },
  update_incident(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    const incidentId = readPathSegment(input.incidentId, "incidentId");
    return normalizeSingleOutput(
      "incident",
      statuspageRequestJson("PATCH", `/pages/${pageId}/incidents/${incidentId}`, context, {
        incident: buildIncidentBody(readObject(input.incident, "incident")),
      }),
      normalizeIncident,
    );
  },
  delete_incident(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    const incidentId = readPathSegment(input.incidentId, "incidentId");
    return normalizeDeleteOutput(statuspageRequestJson("DELETE", `/pages/${pageId}/incidents/${incidentId}`, context));
  },
  list_events(input, context) {
    return normalizeListOutput(
      "events",
      statuspageGetJson(`/pages/${readPathSegment(input.pageId, "pageId")}/page_access_events`, context, {
        limit: input.limit,
        page: input.page,
        q: input.q,
      }),
      normalizeEvent,
    );
  },
  async get_automation_email(input, context) {
    const pageId = readPathSegment(input.pageId, "pageId");
    const raw = await statuspageGetJson(`/pages/${pageId}/automation_email`, context);
    const payload = asLooseObject(raw);
    const automationEmail = optionalString(payload.automation_email ?? payload.automationEmail);
    if (!automationEmail) {
      throw new ProviderRequestError(502, "Statuspage automation email response is missing automation_email.", payload);
    }
    return { automationEmail, raw: payload };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, statuspageActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: statuspageApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "OAuth " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await statuspageGetJson(statuspageValidationPath, context);
    const pages = readArray(payload, "Statuspage pages response");
    const firstPage = pages.map(asLooseObject).find((page) => optionalString(page.name));

    return {
      profile: {
        accountId: firstPage ? (optionalString(firstPage.id) ?? "statuspage-api-token") : "statuspage-api-token",
        displayName: firstPage ? `Statuspage: ${String(firstPage.name)}` : "Statuspage API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: statuspageApiBaseUrl,
        validationEndpoint: statuspageValidationPath,
        firstPageId: firstPage ? optionalString(firstPage.id) : undefined,
        firstPageName: firstPage ? optionalString(firstPage.name) : undefined,
      }),
    };
  },
};

async function statuspageGetJson(
  path: string,
  context: ApiKeyProviderContext,
  query?: Record<string, unknown>,
): Promise<unknown> {
  return statuspageRequestJson("GET", path, context, undefined, query);
}

async function statuspageRequestJson(
  method: string,
  path: string,
  context: ApiKeyProviderContext,
  body?: Record<string, unknown>,
  query?: Record<string, unknown>,
): Promise<unknown> {
  const response = await context.fetcher(buildStatuspageUrl(path, query), {
    method,
    headers: statuspageHeaders(context.apiKey, body ? { "content-type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const payload = await readStatuspagePayload(response);
  if (!response.ok) {
    throw createStatuspageError(response, payload);
  }
  return payload;
}

function buildStatuspageUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(`${statuspageApiPrefix}${path}`, statuspageApiOrigin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function statuspageHeaders(apiKey: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `OAuth ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readStatuspagePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createStatuspageError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractStatuspageErrorMessage(payload) ?? `Statuspage request failed with HTTP ${response.status}`;
  return new ProviderRequestError(
    response.status === 401 ? 401 : response.status >= 500 ? 502 : response.status,
    message,
    payload,
  );
}

function extractStatuspageErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const error = optionalString(object.error);
  if (error) {
    return error;
  }
  const message = optionalString(object.message);
  if (message) {
    return message;
  }
  const errors = object.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map(String).join(", ");
  }
  if (errors && typeof errors === "object") {
    return Object.entries(errors as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.map(String).join(", ") : String(value)}`)
      .join("; ");
  }
  return undefined;
}

async function normalizeListOutput(
  key: string,
  payloadPromise: Promise<unknown>,
  normalizeItem: Normalizer,
): Promise<Record<string, unknown>> {
  const payload = await payloadPromise;
  const raw = readArray(payload, `Statuspage ${key} response`).map(asLooseObject);
  const items = raw.map(normalizeItem);
  return { [key]: items, raw };
}

async function normalizeSingleOutput(
  key: string,
  payloadPromise: Promise<unknown>,
  normalizeItem: Normalizer,
): Promise<Record<string, unknown>> {
  const payload = asLooseObject(await payloadPromise);
  return { [key]: normalizeItem(payload), raw: payload };
}

async function normalizeDeleteOutput(payloadPromise: Promise<unknown>): Promise<Record<string, unknown>> {
  const payload = await payloadPromise;
  return {
    deleted: true,
    raw: optionalRecord(payload) ?? {},
  };
}

function buildComponentBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    status: input.status,
    description: input.description,
    group_id: input.groupId,
    only_show_if_degraded: input.onlyShowIfDegraded,
    showcase: input.showcase,
    start_date: input.startDate,
  });
}

function normalizePage(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(input.id ?? ""),
    name: String(input.name ?? ""),
    subdomain: optionalString(input.subdomain) ?? null,
    url: optionalString(input.url) ?? null,
    raw: input,
  };
}

function normalizeComponent(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(input.id ?? ""),
    name: String(input.name ?? ""),
    status: String(input.status ?? ""),
    groupId: optionalString(input.group_id ?? input.groupId) ?? null,
    raw: input,
  };
}

function normalizeIncident(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(input.id ?? ""),
    name: String(input.name ?? ""),
    status: String(input.status ?? ""),
    impact: optionalString(input.impact) ?? null,
    shortlink: optionalString(input.shortlink) ?? null,
    raw: input,
  };
}

function normalizeEvent(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? null,
    type: optionalString(input.type ?? input.event_type) ?? null,
    createdAt: optionalString(input.created_at ?? input.createdAt) ?? null,
    raw: input,
  };
}

function buildIncidentBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: input.name,
    status: input.status,
    body: input.body,
    impact_override: input.impactOverride,
    deliver_notifications: input.deliverNotifications,
    component_ids: buildIncidentComponentIds(input.components),
    components: buildIncidentComponents(input.components),
    auto_transition_to_maintenance_state: input.autoTransitionToMaintenanceState,
    auto_transition_to_operational_state: input.autoTransitionToOperationalState,
    auto_transition_deliver_notifications_at_end: input.autoTransitionDeliverNotificationsAtEnd,
    auto_tweet_at_beginning: input.autoTweetAtBeginning,
    auto_tweet_on_completion: input.autoTweetOnCompletion,
    auto_tweet_on_creation: input.autoTweetOnCreation,
    auto_tweet_one_hour_before: input.autoTweetOneHourBefore,
    backfill_date: input.backfillDate,
    backfilled: input.backfilled,
    scheduled_for: input.scheduledFor,
    scheduled_until: input.scheduledUntil,
    scheduled_remind_prior: input.scheduledRemindPrior,
    scheduled_auto_in_progress: input.scheduledAutoInProgress,
    scheduled_auto_completed: input.scheduledAutoCompleted,
    metadata: input.metadata,
  });
}

function buildIncidentComponentIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => readIdValue(readObject(item, "component").componentId, "componentId"));
}

function buildIncidentComponents(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(
    value.map((item) => {
      const component = readObject(item, "component");
      return [readIdValue(component.componentId, "componentId"), component.status];
    }),
  );
}

function readIdValue(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required.`);
  }
  return stringValue;
}

function readPathSegment(value: unknown, fieldName: string): string {
  return encodeURIComponent(readIdValue(value, fieldName));
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} object is required.`);
  }
  return object;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is not an array.`, value);
  }
  return value;
}

function asLooseObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}
