import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const lemonSqueezyApiBaseUrl = "https://api.lemonsqueezy.com/v1";
const lemonSqueezyValidationPath = "/users/me";

type LemonSqueezyRequestPhase = "validate" | "execute";
type LemonSqueezyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface LemonSqueezyListResponse {
  meta?: Record<string, unknown>;
  links?: Record<string, unknown>;
  jsonapi?: Record<string, unknown>;
  data: unknown[];
}

interface LemonSqueezySingleResponse {
  meta?: Record<string, unknown>;
  links?: Record<string, unknown>;
  jsonapi?: Record<string, unknown>;
  data: unknown;
}

export const lemonSqueezyActionHandlers: ProviderActionHandlers<"lemon_squeezy", LemonSqueezyActionHandler> = {
  async retrieve_authenticated_user(_input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: "/users/me",
      phase: "execute",
    });

    return toSingleResourceResult("user", response);
  },
  async list_stores(_input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezyListResponse>({
      context,
      path: "/stores",
      phase: "execute",
    });

    return toListResourceResult("stores", response);
  },
  async retrieve_store(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: `/stores/${requireStoreId(input)}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return toSingleResourceResult("store", response);
  },
  async list_products(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezyListResponse>({
      context,
      path: "/products",
      query: compactObject({
        "filter[store_id]": readOptionalStoreId(input),
        "page[number]": readOptionalPageNumber(input),
        "page[size]": readOptionalPageSize(input),
      }),
      phase: "execute",
    });

    return toListResourceResult("products", response);
  },
  async list_variants(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezyListResponse>({
      context,
      path: "/variants",
      query: compactObject({
        "filter[product_id]": readOptionalProductId(input),
        "filter[status]": optionalString(input.status),
        "page[number]": readOptionalPageNumber(input),
        "page[size]": readOptionalPageSize(input),
      }),
      phase: "execute",
    });

    return toListResourceResult("variants", response);
  },
  async list_orders(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezyListResponse>({
      context,
      path: "/orders",
      query: compactObject({
        "filter[store_id]": readOptionalStoreId(input),
        "filter[user_email]": optionalString(input.userEmail),
        "filter[order_number]": readOptionalInteger(input, "orderNumber"),
        "page[number]": readOptionalPageNumber(input),
        "page[size]": readOptionalPageSize(input),
      }),
      phase: "execute",
    });

    return toListResourceResult("orders", response);
  },
  async list_subscriptions(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezyListResponse>({
      context,
      path: "/subscriptions",
      query: compactObject({
        "filter[store_id]": readOptionalStoreId(input),
        "filter[order_id]": readOptionalInteger(input, "orderId"),
        "filter[order_item_id]": readOptionalInteger(input, "orderItemId"),
        "filter[product_id]": readOptionalProductId(input),
        "filter[variant_id]": readOptionalVariantId(input),
        "filter[user_email]": optionalString(input.userEmail),
        "filter[status]": optionalString(input.status),
        "page[number]": readOptionalPageNumber(input),
        "page[size]": readOptionalPageSize(input),
      }),
      phase: "execute",
    });

    return toListResourceResult("subscriptions", response);
  },
  async list_customers(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezyListResponse>({
      context,
      path: "/customers",
      query: compactObject({
        "filter[store_id]": readOptionalStoreId(input),
        "filter[email]": optionalString(input.email),
        "page[number]": readOptionalPageNumber(input),
        "page[size]": readOptionalPageSize(input),
      }),
      phase: "execute",
    });

    return toListResourceResult("customers", response);
  },
  async retrieve_customer(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: `/customers/${requireCustomerId(input)}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return toSingleResourceResult("customer", response);
  },
  async create_customer(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: "/customers",
      method: "POST",
      body: {
        data: {
          type: "customers",
          attributes: compactObject({
            name: optionalString(input.name),
            email: optionalString(input.email),
            city: optionalString(input.city),
            region: optionalString(input.region),
            country: optionalString(input.country),
          }),
          relationships: {
            store: {
              data: {
                type: "stores",
                id: String(requireStoreId(input)),
              },
            },
          },
        },
      },
      phase: "execute",
    });

    return toSingleResourceResult("customer", response);
  },
  async update_customer(input, context) {
    const customerId = requireCustomerId(input);
    requireAtLeastOne(
      input,
      ["name", "email", "city", "region", "country"],
      "At least one customer attribute must be provided",
    );
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: `/customers/${customerId}`,
      method: "PATCH",
      body: {
        data: {
          type: "customers",
          id: customerId,
          attributes: compactObject({
            name: optionalString(input.name),
            email: optionalString(input.email),
            city: optionalString(input.city),
            region: optionalString(input.region),
            country: optionalString(input.country),
          }),
        },
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return toSingleResourceResult("customer", response);
  },
  async list_webhooks(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezyListResponse>({
      context,
      path: "/webhooks",
      query: compactObject({
        "filter[store_id]": readOptionalStoreId(input),
        "page[number]": readOptionalPageNumber(input),
        "page[size]": readOptionalPageSize(input),
      }),
      phase: "execute",
    });

    return toListResourceResult("webhooks", response);
  },
  async retrieve_webhook(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: `/webhooks/${requireWebhookId(input)}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return toSingleResourceResult("webhook", response);
  },
  async create_webhook(input, context) {
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: "/webhooks",
      method: "POST",
      body: {
        data: {
          type: "webhooks",
          attributes: {
            url: optionalString(input.url),
            events: input.events,
            secret: optionalString(input.secret),
          },
          relationships: {
            store: {
              data: {
                type: "stores",
                id: String(requireStoreId(input)),
              },
            },
          },
        },
      },
      phase: "execute",
    });

    return toSingleResourceResult("webhook", response);
  },
  async update_webhook(input, context) {
    const webhookId = requireWebhookId(input);
    requireAtLeastOne(input, ["storeId", "url", "events", "secret"], "At least one webhook attribute must be provided");
    const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
      context,
      path: `/webhooks/${webhookId}`,
      method: "PATCH",
      body: {
        data: {
          type: "webhooks",
          id: webhookId,
          attributes: compactObject({
            store_id: readOptionalStoreId(input),
            url: optionalString(input.url),
            events: Array.isArray(input.events) ? input.events : undefined,
            secret: optionalString(input.secret),
          }),
        },
      },
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return toSingleResourceResult("webhook", response);
  },
  async delete_webhook(input, context) {
    await requestLemonSqueezyNoContent({
      context,
      path: `/webhooks/${requireWebhookId(input)}`,
      method: "DELETE",
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return {
      success: true,
      message:
        "The webhook was deleted. This acknowledgement is generated locally because Lemon Squeezy returns 204 No Content.",
    };
  },
};

export async function validateLemonSqueezyCredential(
  context: ApiKeyProviderContext,
): Promise<CredentialValidationResult> {
  const response = await requestLemonSqueezyJson<LemonSqueezySingleResponse>({
    context,
    path: lemonSqueezyValidationPath,
    phase: "validate",
  });
  const user = readSingleResource(response);
  const userAttributes = optionalRecord(user.attributes) ?? {};
  const accountId = optionalString(userAttributes.email) ?? String(user.id);
  const displayName =
    optionalString(userAttributes.name) ?? optionalString(userAttributes.email) ?? "Lemon Squeezy API Key";

  return {
    profile: {
      accountId,
      displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: lemonSqueezyApiBaseUrl,
      validationEndpoint: lemonSqueezyValidationPath,
      userId: String(user.id),
      email: optionalString(userAttributes.email),
      name: optionalString(userAttributes.name),
      testMode: readOptionalTopLevelTestMode(response),
    }),
  };
}

async function requestLemonSqueezyJson<T>(input: LemonSqueezyRequestInput): Promise<T> {
  const response = await requestLemonSqueezy(input);

  if (response.status === 204) {
    throw new ProviderRequestError(502, "Lemon Squeezy returned 204 No Content for a JSON request");
  }

  const payload = await readLemonSqueezyPayload(response);
  if (response.ok) {
    return payload as T;
  }

  throw mapLemonSqueezyError(response, payload, input.phase, input.notFoundAsInvalidInput);
}

async function requestLemonSqueezyNoContent(input: LemonSqueezyRequestInput & { method: "DELETE" }): Promise<void> {
  const response = await requestLemonSqueezy(input);

  if (response.status === 204) {
    return;
  }

  const payload = await readLemonSqueezyPayload(response);
  if (response.ok) {
    throw new ProviderRequestError(502, "Lemon Squeezy returned a response body for a no-content request");
  }

  throw mapLemonSqueezyError(response, payload, input.phase, input.notFoundAsInvalidInput);
}

interface LemonSqueezyRequestInput {
  context: ApiKeyProviderContext;
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  phase: LemonSqueezyRequestPhase;
  notFoundAsInvalidInput?: boolean;
}

async function requestLemonSqueezy(input: LemonSqueezyRequestInput): Promise<Response> {
  const url = new URL(
    input.path.startsWith("/") ? `${lemonSqueezyApiBaseUrl}${input.path}` : `${lemonSqueezyApiBaseUrl}/${input.path}`,
  );
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const timeout = createProviderTimeout(input.context.signal);

  try {
    return await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: lemonSqueezyHeaders(input.context.apiKey),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Lemon Squeezy request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lemon Squeezy request failed: ${error.message}` : "Lemon Squeezy request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readLemonSqueezyPayload(response: Response): Promise<unknown> {
  const isJsonResponse = response.headers.get("content-type")?.includes("json") === true;
  if (isJsonResponse) {
    return response.json().catch(() => undefined);
  }
  return response.text().catch(() => "");
}

function mapLemonSqueezyError(
  response: Response,
  payload: unknown,
  phase: LemonSqueezyRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const errorMessage = readLemonSqueezyErrorMessage(payload, response.status);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, errorMessage, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, errorMessage, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, errorMessage, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, errorMessage, payload);
}

function lemonSqueezyHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": providerUserAgent,
  };
}

function readLemonSqueezyErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const objectPayload = optionalRecord(payload);
  const errors = Array.isArray(objectPayload?.errors) ? objectPayload.errors : undefined;
  const firstError = errors?.length ? optionalRecord(errors[0]) : undefined;
  const detail = optionalString(firstError?.detail);
  const title = optionalString(firstError?.title);
  if (detail && title) {
    return `${title}: ${detail}`;
  }
  return detail ?? title ?? `Lemon Squeezy request failed with ${status}`;
}

function toListResourceResult(key: string, response: LemonSqueezyListResponse): Record<string, unknown> {
  return {
    [key]: readResourceArray(response),
    ...(response.meta ? { meta: response.meta } : {}),
    ...(response.links ? { links: response.links } : {}),
    ...(response.jsonapi ? { jsonapi: response.jsonapi } : {}),
  };
}

function toSingleResourceResult(key: string, response: LemonSqueezySingleResponse): Record<string, unknown> {
  return {
    [key]: readSingleResource(response),
    ...(response.meta ? { meta: response.meta } : {}),
    ...(response.links ? { links: response.links } : {}),
    ...(response.jsonapi ? { jsonapi: response.jsonapi } : {}),
  };
}

function readResourceArray(response: LemonSqueezyListResponse): Array<Record<string, unknown>> {
  if (!Array.isArray(response.data)) {
    throw new ProviderRequestError(502, "Lemon Squeezy list response did not return an array", response);
  }
  return response.data.map((item) => requiredResponseRecord(item, "Lemon Squeezy resource"));
}

function readSingleResource(response: LemonSqueezySingleResponse): Record<string, unknown> {
  return requiredResponseRecord(response.data, "Lemon Squeezy resource");
}

function readOptionalTopLevelTestMode(response: LemonSqueezySingleResponse): boolean | undefined {
  const meta = optionalRecord(response.meta);
  return typeof meta?.test_mode === "boolean" ? meta.test_mode : undefined;
}

function requireStoreId(input: Record<string, unknown>): number {
  const value = readOptionalStoreId(input);
  if (value !== undefined) {
    return value;
  }
  throw new ProviderRequestError(400, "storeId is required");
}

function readOptionalStoreId(input: Record<string, unknown>): number | undefined {
  return readOptionalInteger(input, "storeId");
}

function readOptionalProductId(input: Record<string, unknown>): number | undefined {
  return readOptionalInteger(input, "productId");
}

function readOptionalVariantId(input: Record<string, unknown>): number | undefined {
  return readOptionalInteger(input, "variantId");
}

function requireCustomerId(input: Record<string, unknown>): string {
  const value = optionalString(input.customerId);
  if (value) {
    return value;
  }
  throw new ProviderRequestError(400, "customerId is required");
}

function requireWebhookId(input: Record<string, unknown>): string {
  const value = optionalString(input.webhookId);
  if (value) {
    return value;
  }
  throw new ProviderRequestError(400, "webhookId is required");
}

function readOptionalPageNumber(input: Record<string, unknown>): number | undefined {
  return readOptionalInteger(input, "pageNumber");
}

function readOptionalPageSize(input: Record<string, unknown>): number | undefined {
  return readOptionalInteger(input, "pageSize");
}

function readOptionalInteger(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = optionalInteger(input[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function requireAtLeastOne(input: Record<string, unknown>, keys: string[], message: string): void {
  if (keys.some((key) => input[key] !== undefined)) {
    return;
  }
  throw new ProviderRequestError(400, message);
}
