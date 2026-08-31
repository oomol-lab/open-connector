import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

export const courierApiBaseUrl = "https://api.courier.com";

const courierValidationPath = "/lists";

type CourierRequestPhase = "validate" | "execute";
type CourierActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface CourierRequestInput {
  path: string;
  method: "DELETE" | "GET" | "POST" | "PUT";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: CourierRequestPhase;
  params?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
}

interface CourierResponse {
  status: number;
  payload: unknown;
}

export const courierActionHandlers: ProviderActionHandlers<"courier", CourierActionHandler> = {
  async send_message(input, context) {
    const idempotencyKey = readOptionalTrimmedString(input.idempotencyKey);
    const response = await requestCourierJson({
      path: "/send",
      method: "POST",
      context,
      phase: "execute",
      body: {
        message: requiredRecord(input.message, "message"),
      },
      idempotencyKey,
    });
    const record = requireResponseObject(response.payload, "Courier returned an invalid send payload");

    return {
      requestId: record.requestId ?? null,
      raw: record,
    };
  },
  async get_profile(input, context) {
    const userId = requiredInputString(input.userId, "userId");
    const response = await requestCourierJson({
      path: `/profiles/${encodeURIComponent(userId)}`,
      method: "GET",
      context,
      phase: "execute",
    });
    const record = requireResponseObject(response.payload, "Courier returned an invalid profile payload");

    return {
      userId,
      profile: optionalRecord(record.profile) ?? {},
      preferences: optionalRecord(record.preferences) ?? null,
      raw: record,
    };
  },
  async merge_profile(input, context) {
    const userId = requiredInputString(input.userId, "userId");
    const response = await requestCourierJson({
      path: `/profiles/${encodeURIComponent(userId)}`,
      method: "POST",
      context,
      phase: "execute",
      body: {
        profile: requiredRecord(input.profile, "profile"),
      },
    });
    const record = requireResponseObject(response.payload, "Courier returned an invalid profile payload");

    return {
      userId,
      status: optionalString(record.status) ?? null,
      raw: record,
    };
  },
  async delete_profile(input, context) {
    const userId = requiredInputString(input.userId, "userId");
    const response = await requestCourierJson({
      path: `/profiles/${encodeURIComponent(userId)}`,
      method: "DELETE",
      context,
      phase: "execute",
    });

    return {
      userId,
      success: true,
      statusCode: response.status,
    };
  },
  async list_lists(input, context) {
    const response = await requestCourierJson({
      path: "/lists",
      method: "GET",
      context,
      phase: "execute",
      params: compactObject({
        cursor: readOptionalTrimmedString(input.cursor),
        pattern: readOptionalTrimmedString(input.pattern),
      }),
    });
    const record = requireResponseObject(response.payload, "Courier returned an invalid lists payload");

    return {
      paging: normalizePaging(record.paging),
      lists: normalizeLists(record.items),
      raw: record,
    };
  },
  async get_list(input, context) {
    const listId = requiredInputString(input.listId, "listId");
    const response = await requestCourierJson({
      path: `/lists/${encodeURIComponent(listId)}`,
      method: "GET",
      context,
      phase: "execute",
    });
    const record = requireResponseObject(response.payload, "Courier returned an invalid list payload");

    return {
      list: normalizeList(record),
      raw: record,
    };
  },
  async upsert_list(input, context) {
    const listId = requiredInputString(input.listId, "listId");
    const preferences = optionalRecord(input.preferences);
    const response = await requestCourierJson({
      path: `/lists/${encodeURIComponent(listId)}`,
      method: "PUT",
      context,
      phase: "execute",
      body: compactObject({
        name: requiredInputString(input.name, "name"),
        preferences,
      }),
    });

    return {
      listId,
      success: true,
      statusCode: response.status,
    };
  },
  async delete_list(input, context) {
    const listId = requiredInputString(input.listId, "listId");
    const response = await requestCourierJson({
      path: `/lists/${encodeURIComponent(listId)}`,
      method: "DELETE",
      context,
      phase: "execute",
    });

    return {
      listId,
      success: true,
      statusCode: response.status,
    };
  },
  async list_list_subscriptions(input, context) {
    const listId = requiredInputString(input.listId, "listId");
    const response = await requestCourierJson({
      path: `/lists/${encodeURIComponent(listId)}/subscriptions`,
      method: "GET",
      context,
      phase: "execute",
      params: compactObject({
        cursor: readOptionalTrimmedString(input.cursor),
      }),
    });
    const record = requireResponseObject(response.payload, "Courier returned an invalid list subscriptions payload");

    return {
      listId,
      paging: normalizePaging(record.paging),
      subscriptions: normalizeListSubscriptions(record.items),
      raw: record,
    };
  },
  async add_list_subscribers(input, context) {
    const listId = requiredInputString(input.listId, "listId");
    const response = await requestCourierJson({
      path: `/lists/${encodeURIComponent(listId)}/subscriptions`,
      method: "POST",
      context,
      phase: "execute",
      body: {
        recipients: normalizeSubscriberInput(input.recipients),
      },
    });

    return {
      listId,
      success: true,
      statusCode: response.status,
    };
  },
  async unsubscribe_list_subscriber(input, context) {
    const listId = requiredInputString(input.listId, "listId");
    const userId = requiredInputString(input.userId, "userId");
    const response = await requestCourierJson({
      path: `/lists/${encodeURIComponent(listId)}/subscriptions/${encodeURIComponent(userId)}`,
      method: "DELETE",
      context,
      phase: "execute",
    });

    return {
      listId,
      userId,
      success: true,
      statusCode: response.status,
    };
  },
};

export async function validateCourierCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await requestCourierJson({
    path: courierValidationPath,
    method: "GET",
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const record = requireResponseObject(response.payload, "Courier returned an invalid lists payload");
  const lists = normalizeLists(record.items);

  return {
    profile: {
      accountId: "courier-api-key",
      displayName: "Courier API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: courierApiBaseUrl,
      validationEndpoint: courierValidationPath,
      listCount: lists.length,
      firstListId: lists[0]?.id,
    }),
  };
}

async function requestCourierJson(input: CourierRequestInput): Promise<CourierResponse> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    };

    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    if (input.idempotencyKey) {
      headers["idempotency-key"] = input.idempotencyKey;
    }

    const response = await input.context.fetcher(buildCourierUrl(input.path, input.params), {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readCourierPayload(response);

    if (!response.ok) {
      throw createCourierError(response.status, payload, input.phase);
    }

    return {
      status: response.status,
      payload,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Courier request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Courier request failed: ${error.message}` : "Courier request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildCourierUrl(path: string, params: Record<string, string | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${courierApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readCourierPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Courier returned invalid JSON", text);
  }
}

function createCourierError(status: number, payload: unknown, phase: CourierRequestPhase): ProviderRequestError {
  const message = extractCourierErrorMessage(payload) ?? `Courier request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractCourierErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.type);
}

function requireResponseObject(input: unknown, errorMessage: string): Record<string, unknown> {
  const record = optionalRecord(input);
  if (!record) {
    throw new ProviderRequestError(502, errorMessage);
  }
  return record;
}

function normalizePaging(value: unknown): Record<string, unknown> {
  const paging = optionalRecord(value);
  return {
    cursor: optionalString(paging?.cursor) ?? null,
    more: typeof paging?.more === "boolean" ? paging.more : false,
  };
}

function normalizeLists(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => normalizeList(requiredRecord(item, "list"))) : [];
}

function normalizeList(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(input.id) ?? "",
    name: optionalString(input.name) ?? "",
    created: readNullableString(input.created),
    updated: readNullableString(input.updated),
    raw: input,
  };
}

function normalizeListSubscriptions(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => {
        const record = requiredRecord(item, "subscription");
        return {
          recipientId: optionalString(record.recipientId) ?? "",
          created: readNullableString(record.created),
          preferences: optionalRecord(record.preferences) ?? null,
          raw: record,
        };
      })
    : [];
}

function normalizeSubscriberInput(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "recipients").map((recipient) =>
    compactObject({
      recipientId: requiredInputString(recipient.recipientId, "recipientId"),
      preferences: optionalRecord(recipient.preferences),
    }),
  );
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : (optionalString(value) ?? null);
}
