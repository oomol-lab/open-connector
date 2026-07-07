import type { CredentialValidationResult, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { RefinerActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "refiner";
const refinerApiBaseUrl = "https://api.refiner.io/v1";
const refinerValidationPath = "/account";

type RefinerQueryValue = string | number | boolean | string[] | undefined | null;
type RefinerActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface RefinerRequestOptions {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, RefinerQueryValue>;
  body?: Record<string, unknown> | undefined;
  mode: "validate" | "execute";
}

export const refinerActionHandlers: Record<RefinerActionName, RefinerActionHandler> = {
  get_account_info(_input, context) {
    return refinerGetAccountInfo(context);
  },
  list_contacts(input, context) {
    return refinerListContacts(input, context);
  },
  get_contact(input, context) {
    return refinerGetContact(input, context);
  },
  identify_user(input, context) {
    return refinerIdentifyUser(input, context);
  },
  track_event(input, context) {
    return refinerTrackEvent(input, context);
  },
  list_forms(input, context) {
    return refinerListForms(input, context);
  },
  list_segments(input, context) {
    return refinerListSegments(input, context);
  },
  list_responses(input, context) {
    return refinerListResponses(input, context);
  },
  tag_response(input, context) {
    return refinerTagResponse(input, context);
  },
  get_reporting(input, context) {
    return refinerGetReporting(input, context);
  },
  add_contact_to_segment(input, context) {
    return refinerSyncSegment(input, context, "POST");
  },
  remove_contact_from_segment(input, context) {
    return refinerSyncSegment(input, context, "DELETE");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, refinerActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: refinerApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators = {
  async apiKey(
    input: { apiKey: string; values: Record<string, string> },
    options: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    const account = await requestRefinerObject({
      context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
      path: refinerValidationPath,
      mode: "validate",
    });
    const organizationName = optionalString(account.organization_name);
    const projectName = optionalString(account.project_name);
    const subscription = optionalRecord(account.subscription);
    const subscriptionPlan = subscription ? pickNonEmptyString(subscription, "plan", "name", "title") : undefined;
    const accountId = [organizationName, projectName].filter(Boolean).join("/") || undefined;
    return {
      profile: {
        accountId,
        displayName: accountId ?? projectName ?? organizationName ?? "Refiner API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: refinerApiBaseUrl,
        validationEndpoint: refinerValidationPath,
        organizationName,
        projectName,
        subscriptionPlan,
        responsesCount: optionalNumber(account.responses_count),
        usagePercentage: optionalNumber(account.usage_percentage),
      }),
    };
  },
};

async function refinerGetAccountInfo(context: ApiKeyProviderContext): Promise<unknown> {
  const account = await requestRefinerObject({ context, path: refinerValidationPath, mode: "execute" });
  return { account };
}

async function refinerListContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = await requestRefinerObject({
    context,
    path: "/contacts",
    query: compactObject({
      page: optionalNumber(input.page),
      page_cursor: optionalString(input.pageCursor),
      page_length: optionalNumber(input.pageLength),
    }),
    mode: "execute",
  });
  return { contacts: requireArrayField(body.items, "items"), pagination: optionalRecord(body.pagination) };
}

async function refinerGetContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const contact = await requestRefinerObject({
    context,
    path: "/contact",
    query: buildIdentifierPayload(input),
    mode: "execute",
  });
  return { contact };
}

async function refinerIdentifyUser(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const traits = optionalRecord(input.traits) ?? {};
  const body = await requestRefinerObject({
    context,
    path: "/identify-user",
    method: "POST",
    body: {
      ...traits,
      ...compactObject({
        ...buildIdentifierPayload(input),
        name: optionalString(input.name),
        account: optionalRecord(input.account),
        segment_uuids: asOptionalStringArray(input.segmentUuids),
      }),
    },
    mode: "execute",
  });
  return normalizeMutationResult(body);
}

async function refinerTrackEvent(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const eventAttributes = optionalRecord(input.eventAttributes) ?? {};
  const body = await requestRefinerObject({
    context,
    path: "/track-event",
    method: "POST",
    body: {
      ...eventAttributes,
      ...compactObject({
        ...buildIdentifierPayload(input),
        event_name: requireNonEmptyString(input.eventName, "eventName"),
        session_id: optionalString(input.sessionId),
        received_at: optionalString(input.receivedAt),
      }),
    },
    mode: "execute",
  });
  return normalizeMutationResult(body);
}

async function refinerListForms(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = await requestRefinerObject({
    context,
    path: "/forms",
    query: compactObject({
      uuid: optionalString(input.uuid),
      type: optionalString(input.type),
      current_page: optionalNumber(input.currentPage),
      page_length: optionalNumber(input.pageLength),
      show_config: optionalBoolean(input.showConfig),
      show_info: optionalBoolean(input.showInfo),
    }),
    mode: "execute",
  });
  return { forms: requireArrayField(body.items, "items"), pagination: optionalRecord(body.pagination) };
}

async function refinerListSegments(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = await requestRefinerObject({
    context,
    path: "/segments",
    query: compactObject({
      uuid: optionalString(input.uuid),
      current_page: optionalNumber(input.currentPage),
      page_length: optionalNumber(input.pageLength),
    }),
    mode: "execute",
  });
  return { segments: requireArrayField(body.items, "items"), pagination: optionalRecord(body.pagination) };
}

async function refinerListResponses(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = await requestRefinerObject({
    context,
    path: "/responses",
    query: compactObject({
      current_page: optionalNumber(input.currentPage),
      page_cursor: optionalString(input.pageCursor),
      page_length: optionalNumber(input.pageLength),
      status: optionalString(input.status),
      form_uuid: optionalString(input.formUuid),
      contact_uuid: optionalString(input.contactUuid),
      segment_uuid: optionalString(input.segmentUuid),
      date_range_start: optionalString(input.dateRangeStart),
      date_range_end: optionalString(input.dateRangeEnd),
    }),
    mode: "execute",
  });
  return { responses: requireArrayField(body.items, "items"), pagination: optionalRecord(body.pagination) };
}

async function refinerTagResponse(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = await requestRefinerObject({
    context,
    path: "/responses/tags",
    method: "POST",
    body: {
      response_uuid: requireNonEmptyString(input.responseUuid, "responseUuid"),
      tag_name: requireNonEmptyString(input.tagName, "tagName"),
    },
    mode: "execute",
  });
  return normalizeMutationResult(body);
}

async function refinerGetReporting(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const reportType = requireNonEmptyString(input.reportType, "reportType");
  const report = await requestRefinerObject({
    context,
    path: "/reporting",
    query: compactObject({
      report_type: reportType,
      question_identifiers: asOptionalStringArray(input.questionIdentifiers),
      form_uuids: asOptionalStringArray(input.formUuids),
      segment_uuids: asOptionalStringArray(input.segmentUuids),
      tag_uuids: asOptionalStringArray(input.tagUuids),
      date_range_start: optionalString(input.dateRangeStart),
      date_range_end: optionalString(input.dateRangeEnd),
    }),
    mode: "execute",
  });
  return { reportType, report };
}

async function refinerSyncSegment(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  method: "POST" | "DELETE",
): Promise<unknown> {
  const body = await requestRefinerObject({
    context,
    path: "/sync-segment",
    method,
    body: {
      segment_uuid: requireNonEmptyString(input.segmentUuid, "segmentUuid"),
      ...buildIdentifierPayload(input),
    },
    mode: "execute",
  });
  return normalizeMutationResult(body);
}

function buildIdentifierPayload(input: Record<string, unknown>): Record<string, string | undefined> {
  const payload = compactObject({
    id: optionalString(input.id),
    email: optionalString(input.email),
    uuid: optionalString(input.uuid),
  });
  if (Object.keys(payload).length === 0) {
    throw new ProviderRequestError(400, "At least one of id, email, or uuid is required.");
  }
  return payload;
}

function normalizeMutationResult(body: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    message: extractRefinerMessage(body),
    uuid: optionalString(body.uuid),
    contactUuid: pickNonEmptyString(body, "contact_uuid", "contactUuid"),
    segmentUuid: pickNonEmptyString(body, "segment_uuid", "segmentUid", "segmentUuid", "segment_uid"),
    responseUuid: pickNonEmptyString(body, "response_uuid", "responseUuid"),
    raw: body,
  });
}

async function requestRefinerObject(options: RefinerRequestOptions): Promise<Record<string, unknown>> {
  const payload = await requestRefinerJson(options);
  return requireObjectPayload(payload, options.path);
}

async function requestRefinerJson(options: RefinerRequestOptions): Promise<unknown> {
  const normalizedPath = options.path.startsWith("/") ? options.path.slice(1) : options.path;
  const url = new URL(normalizedPath, `${refinerApiBaseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    appendQueryValue(url, key, value);
  }
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${options.context.apiKey}`,
    "User-Agent": providerUserAgent,
  });
  let body: string | undefined;
  if (options.body) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await options.context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Refiner request failed: ${error.message}` : "Refiner request failed",
    );
  }
  const payload = await parseRefinerPayload(response);
  if (!response.ok) {
    throw mapRefinerError(response, payload, options.mode);
  }
  return payload;
}

async function parseRefinerPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      throw new ProviderRequestError(502, "Refiner returned invalid JSON");
    }
  }
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapRefinerError(
  response: Response,
  payload: unknown,
  mode: RefinerRequestOptions["mode"],
): ProviderRequestError {
  const message =
    extractRefinerMessage(optionalRecord(payload) ?? undefined) ??
    `Refiner request failed with status ${response.status}`;
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 401 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function appendQueryValue(url: URL, key: string, value: RefinerQueryValue): void {
  if (value == null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(`${key}[]`, item);
    }
    return;
  }
  url.searchParams.set(key, String(value));
}

function requireObjectPayload(payload: unknown, source: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `Refiner ${source} response must be an object`);
  }
  return record;
}

function requireArrayField(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Refiner response field ${fieldName} must be an array`);
  }
  return value;
}

function extractRefinerMessage(payload: Record<string, unknown> | undefined): string {
  if (!payload) {
    return "Refiner request completed.";
  }
  return pickNonEmptyString(payload, "message", "error", "detail") ?? "Refiner request completed.";
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function pickNonEmptyString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}
