import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const subvisoryApiBaseUrl = "https://www.subvisory.com";
const validationPath = "/api/v1/subscriptions";

type SubvisoryRequestMode = "validate" | "execute";
type SubvisoryActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type SubvisoryActionHandler = (input: Record<string, unknown>, context: SubvisoryActionContext) => Promise<unknown>;

interface SubvisoryRequestInput {
  apiKey: string;
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  mode: SubvisoryRequestMode;
}

export const subvisoryActionHandlers: ProviderActionHandlers<"subvisory", SubvisoryActionHandler> = {
  list_subscriptions(_input, context) {
    return requestSubvisoryJson({ ...context, path: "/api/v1/subscriptions", mode: "execute" });
  },
  create_subscription(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: "/api/v1/subscriptions",
      method: "POST",
      body: pickSubscriptionFields(input),
      mode: "execute",
    });
  },
  get_subscription(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/subscriptions/${encodePathId(input.id, "id")}`,
      mode: "execute",
    });
  },
  update_subscription(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/subscriptions/${encodePathId(input.id, "id")}`,
      method: "PUT",
      body: pickSubscriptionFields(input),
      mode: "execute",
    });
  },
  delete_subscription(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/subscriptions/${encodePathId(input.id, "id")}`,
      method: "DELETE",
      mode: "execute",
    });
  },
  list_categories(_input, context) {
    return requestSubvisoryJson({ ...context, path: "/api/v1/categories", mode: "execute" });
  },
  create_category(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: "/api/v1/categories",
      method: "POST",
      body: pickCategoryFields(input),
      mode: "execute",
    });
  },
  get_category(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/categories/${encodePathId(input.id, "id")}`,
      mode: "execute",
    });
  },
  update_category(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/categories/${encodePathId(input.id, "id")}`,
      method: "PUT",
      body: pickCategoryFields(input),
      mode: "execute",
    });
  },
  delete_category(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/categories/${encodePathId(input.id, "id")}`,
      method: "DELETE",
      mode: "execute",
    });
  },
  list_payment_methods(_input, context) {
    return requestSubvisoryJson({ ...context, path: "/api/v1/payment-methods", mode: "execute" });
  },
  create_payment_method(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: "/api/v1/payment-methods",
      method: "POST",
      body: pickPaymentMethodFields(input),
      mode: "execute",
    });
  },
  get_payment_method(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/payment-methods/${encodePathId(input.id, "id")}`,
      mode: "execute",
    });
  },
  update_payment_method(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/payment-methods/${encodePathId(input.id, "id")}`,
      method: "PUT",
      body: pickPaymentMethodFields(input),
      mode: "execute",
    });
  },
  delete_payment_method(input, context) {
    return requestSubvisoryJson({
      ...context,
      path: `/api/v1/payment-methods/${encodePathId(input.id, "id")}`,
      method: "DELETE",
      mode: "execute",
    });
  },
};

export async function validateSubvisoryCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSubvisoryJson({
    apiKey,
    path: validationPath,
    fetcher,
    signal,
    mode: "validate",
  });
  const subscriptions = Array.isArray(payload.data) ? payload.data : [];
  const firstSubscription = optionalRecord(subscriptions[0]);

  return {
    profile: {
      accountId: "api_key",
      displayName: "Subvisory API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: subvisoryApiBaseUrl,
      validationEndpoint: validationPath,
      subscriptionCount: subscriptions.length,
      firstSubscriptionId: optionalString(firstSubscription?.id),
      firstSubscriptionName: optionalString(firstSubscription?.name),
    }),
  };
}

async function requestSubvisoryJson(input: SubvisoryRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(input.path, subvisoryApiBaseUrl);
  const method = input.method ?? "GET";
  let response: Response;
  let payload: unknown;

  try {
    response = await input.fetcher(url, {
      method,
      headers: subvisoryHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Subvisory request failed for ${method} ${url.toString()}: ${error.message}`
        : `Subvisory request failed for ${method} ${url.toString()}`,
    );
  }

  if (!response.ok) {
    throw toSubvisoryError(response.status, payload, input.mode);
  }

  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    throw new ProviderRequestError(502, "Subvisory returned a non-object JSON payload", payload);
  }
  return objectPayload;
}

function subvisoryHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    "X-API-Key": apiKey,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return { success: true };
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Subvisory returned invalid JSON");
  }
}

function toSubvisoryError(status: number, payload: unknown, mode: SubvisoryRequestMode): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Subvisory request failed with status ${status}`;
  if (status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    return undefined;
  }
  return optionalString(objectPayload.error) ?? optionalString(objectPayload.message);
}

function pickSubscriptionFields(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    cost: typeof input.cost === "string" || typeof input.cost === "number" ? input.cost : undefined,
    currency: optionalString(input.currency),
    billingCycle: optionalString(input.billingCycle),
    customCycleDays: input.customCycleDays === null ? null : optionalNumber(input.customCycleDays),
    startDate: optionalString(input.startDate),
    status: optionalString(input.status),
    categoryId: nullableString(input.categoryId),
    paymentMethodId: nullableString(input.paymentMethodId),
    notes: nullableString(input.notes),
    cancellationReason: nullableString(input.cancellationReason),
    logoUrl: nullableString(input.logoUrl),
    url: nullableString(input.url),
    autoRenew: optionalBoolean(input.autoRenew),
  });
}

function pickCategoryFields(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    color: optionalString(input.color),
    icon: nullableString(input.icon),
    isDefault: optionalBoolean(input.isDefault),
    sortOrder: optionalNumber(input.sortOrder),
  });
}

function pickPaymentMethodFields(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    label: optionalString(input.label),
    type: nullableString(input.type),
    icon: nullableString(input.icon),
    sortOrder: optionalNumber(input.sortOrder),
  });
}

function encodePathId(value: unknown, fieldName: string): string {
  const id = optionalString(value);
  if (!id) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(id);
}
