import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const twochatApiBaseUrl = "https://api.p.2chat.io";

const twochatValidationPath = "/open/info";
const twochatRequestTimeoutMs = 30_000;

type TwochatRequestPhase = "validate" | "execute";
type TwochatQueryValue = string | number | boolean | undefined;
type TwochatActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface TwochatRequestInput {
  apiKey: string;
  fetcher: ProviderFetch;
  path: string;
  phase: TwochatRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, TwochatQueryValue>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}

interface TwochatResponse {
  status: number;
  payload: unknown;
  rawText: string;
}

export const twochatActionHandlers: ProviderActionHandlers<"twochat", TwochatActionHandler> = {
  test_api_key(_input, context) {
    return getTwochatInfo(context.apiKey, context.fetcher, "execute", context.signal);
  },
  get_api_usage_info(_input, context) {
    return getTwochatInfo(context.apiKey, context.fetcher, "execute", context.signal);
  },
  async list_webhooks(_input, context) {
    const payload = await requestTwochatJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/open/webhooks",
      phase: "execute",
      signal: context.signal,
    });

    return {
      webhooks: normalizeTwochatWebhookCollection(payload),
    };
  },
  async list_contacts(input, context) {
    const payload = await requestTwochatJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/open/contacts",
      phase: "execute",
      query: {
        page_number: readOptionalQueryValue(input.pageNumber),
        results_per_page: readOptionalQueryValue(input.resultsPerPage),
        channel_uuid: readOptionalQueryValue(input.channelUuid),
      },
      signal: context.signal,
    });

    return normalizeTwochatContactsEnvelope(payload);
  },
  async create_contact(input, context) {
    const contactDetails = Array.isArray(input.contactDetails) ? input.contactDetails : [];
    const payload = await requestTwochatJson({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      path: "/open/contacts",
      phase: "execute",
      method: "POST",
      body: compactObject({
        first_name: input.firstName,
        last_name: input.lastName,
        channel_uuid: input.channelUuid,
        profile_pic_url: input.profilePicUrl,
        contact_detail: contactDetails.map((detail) => {
          const record = isRecord(detail) ? detail : {};
          return {
            type: record.type,
            value: record.value,
          };
        }),
      }),
      signal: context.signal,
    });

    return {
      contact: normalizeTwochatCreatedContact(payload),
    };
  },
};

export async function validateTwochatCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  const info = await getTwochatInfo(apiKey.trim(), fetcher, "validate", signal);

  return {
    profile: {
      accountId: `twochat:account:${info.account.uuid}`,
      displayName: info.account.name,
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: twochatApiBaseUrl,
      validationEndpoint: twochatValidationPath,
      accountUuid: info.account.uuid,
      accountName: info.account.name,
      onTrial: info.account.onTrial,
      blocked: info.account.blocked,
      createdAt: info.account.createdAt,
      expiresAt: info.account.expiresAt,
      requestsPerMinute: info.limits.requestsPerMinute,
    }),
  };
}

async function getTwochatInfo(
  apiKey: string,
  fetcher: ProviderFetch,
  phase: TwochatRequestPhase,
  signal?: AbortSignal,
): Promise<ReturnType<typeof normalizeTwochatInfo>> {
  const payload = await requestTwochatJson({
    apiKey,
    fetcher,
    path: twochatValidationPath,
    phase,
    signal,
  });

  return normalizeTwochatInfo(payload);
}

async function requestTwochatJson(input: TwochatRequestInput): Promise<unknown> {
  const response = await requestTwochat(input);
  if (response.status < 200 || response.status >= 300) {
    throwTwochatError(response, input.phase);
  }
  if (response.payload === undefined) {
    throw new ProviderRequestError(502, "empty 2Chat response body");
  }

  return response.payload;
}

async function requestTwochat(input: TwochatRequestInput): Promise<TwochatResponse> {
  const timeout = createProviderTimeout(input.signal, twochatRequestTimeoutMs);
  const url = new URL(input.path, `${twochatApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-user-api-key": input.apiKey,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });

    const rawText = await response.text();
    return {
      status: response.status,
      payload: parseJsonSafely(rawText),
      rawText,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "2Chat request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "2Chat request failed");
  } finally {
    timeout.cleanup();
  }
}

function throwTwochatError(response: TwochatResponse, phase: TwochatRequestPhase): never {
  const rawMessage = response.rawText.trim();
  const message =
    extractTwochatErrorMessage(response.payload) || rawMessage || `2Chat request failed with status ${response.status}`;
  const preservedStatus = response.status || 502;

  if (
    response.status === 402 ||
    response.status === 409 ||
    response.status === 410 ||
    response.status === 429 ||
    response.status === 486
  ) {
    throw new ProviderRequestError(429, message);
  }

  if (response.status === 401) {
    throw new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (response.status === 403 || response.status === 406) {
    throw new ProviderRequestError(preservedStatus, message);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, message);
  }

  throw new ProviderRequestError(
    preservedStatus,
    phase === "validate" ? `2Chat credential validation failed: ${message}` : message,
  );
}

function normalizeTwochatInfo(payload: unknown): {
  account: {
    name: string;
    uuid: string;
    onTrial: boolean;
    blocked: boolean;
    createdAt: string;
    expiresAt: string;
  };
  limits: {
    requestsPerMinute: number;
  };
  usage: {
    apiRequestCount: number;
    maxApiRequestCount: number;
    numberCheckCount: number;
    maxNumberCheckCount: number;
  };
} {
  const root = requireRecord(payload, "2Chat info response");
  const account = requireRecord(root.account, "2Chat account");
  const limits = requireRecord(root.limits, "2Chat limits");
  const usage = requireRecord(root.usage, "2Chat usage");

  return {
    account: {
      name: readRequiredString(account.name, "account.name"),
      uuid: readRequiredString(account.uuid, "account.uuid"),
      onTrial: readRequiredBoolean(account.on_trial, "account.on_trial"),
      blocked: readRequiredBoolean(account.blocked, "account.blocked"),
      createdAt: normalizeRequiredTimestamp(account.created_at, "account.created_at"),
      expiresAt: normalizeRequiredTimestamp(account.expires_at, "account.expires_at"),
    },
    limits: {
      requestsPerMinute: readRequiredInteger(limits.requests_per_minute, "limits.requests_per_minute"),
    },
    usage: {
      apiRequestCount: readRequiredInteger(usage.api_request_count, "usage.api_request_count"),
      maxApiRequestCount: readRequiredInteger(usage.max_api_request_count, "usage.max_api_request_count"),
      numberCheckCount: readRequiredInteger(usage.number_check_count, "usage.number_check_count"),
      maxNumberCheckCount: readRequiredInteger(usage.max_number_check_count, "usage.max_number_check_count"),
    },
  };
}

function normalizeTwochatWebhookCollection(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => normalizeTwochatWebhook(requireRecord(item, `2Chat webhooks[${index}]`)));
  }

  const root = requireRecord(payload, "2Chat webhooks response");
  if (!Array.isArray(root.webhooks)) {
    throw new ProviderRequestError(502, "invalid 2Chat webhooks response");
  }

  return root.webhooks.map((item, index) => normalizeTwochatWebhook(requireRecord(item, `2Chat webhooks[${index}]`)));
}

function normalizeTwochatWebhook(record: Record<string, unknown>): Record<string, unknown> {
  return {
    uuid: readRequiredString(record.uuid, "webhooks.uuid"),
    eventName: readRequiredString(record.event_name, "webhooks.event_name"),
    channelUuid: readRequiredString(record.channel_uuid, "webhooks.channel_uuid"),
    hookUrl: readRequiredString(record.hook_url, "webhooks.hook_url"),
    hookParams: readObjectOrDefault(record.hook_params),
    createdAt: normalizeRequiredTimestamp(record.created_at, "webhooks.created_at"),
  };
}

function normalizeTwochatContactsEnvelope(payload: unknown): Record<string, unknown> {
  const root = requireRecord(payload, "2Chat contacts response");
  const contacts = readRequiredArray(root.contacts, "contacts");

  return {
    page: readRequiredInteger(root.page, "page"),
    count: readRequiredInteger(root.count, "count"),
    contacts: contacts.map((item, index) => normalizeTwochatContact(requireRecord(item, `contacts[${index}]`))),
  };
}

function normalizeTwochatCreatedContact(payload: unknown): Record<string, unknown> {
  const root = requireRecord(payload, "2Chat create contact response");
  if (isRecord(root.contact)) {
    return normalizeTwochatContact(root.contact);
  }
  return normalizeTwochatContact(root);
}

function normalizeTwochatContact(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readOptionalInteger(record.id) ?? null,
    uuid: readRequiredString(record.uuid, "contact.uuid"),
    firstName: readString(record.first_name, "contact.first_name"),
    lastName: readNullableString(record.last_name, "contact.last_name"),
    channelUuid: readNullableString(record.channel_uuid, "contact.channel_uuid"),
    profilePicUrl: readNullableString(record.profile_pic_url, "contact.profile_pic_url"),
    details: readRequiredArray(record.details, "contact.details").map((item, index) =>
      normalizeTwochatContactDetail(requireRecord(item, `contact.details[${index}]`)),
    ),
  };
}

function normalizeTwochatContactDetail(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readRequiredInteger(record.id, "contact.details.id"),
    value: readRequiredString(record.value, "contact.details.value"),
    type: readRequiredString(record.type, "contact.details.type"),
    createdAt: normalizeOptionalTimestamp(record.created_at, "contact.details.created_at"),
    updatedAt: normalizeOptionalTimestamp(record.updated_at, "contact.details.updated_at"),
  };
}

function normalizeRequiredTimestamp(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalTimestamp(value, fieldName);
  if (normalized === null) {
    throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
  }
  return normalized;
}

function normalizeOptionalTimestamp(value: unknown, fieldName: string): string | null {
  if (value == null || value === 0) {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
    }
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string") {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.valueOf())) {
      throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
    }
    return parsedDate.toISOString();
  }

  throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
}

function extractTwochatErrorMessage(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of ["error", "message", "detail"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  const errors = payload.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }

  const parts = errors.filter((item): item is string => typeof item === "string" && item.length > 0);
  return parts.length > 0 ? parts.join("; ") : undefined;
}

function parseJsonSafely(value: string): unknown {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return value;
}

function readObjectOrDefault(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
  }
  return value;
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
  }
  return value;
}

function readNullableString(value: unknown, fieldName: string): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
  }
  return value;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `invalid 2Chat ${fieldName}`);
  }
  return parsed;
}

function readOptionalInteger(value: unknown): number | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readOptionalQueryValue(value: unknown): TwochatQueryValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}
