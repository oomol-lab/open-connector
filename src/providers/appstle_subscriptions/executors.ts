import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "appstle_subscriptions";
const appstleSubscriptionsApiBaseUrl = "https://subscription-admin.appstle.com";

type AppstleSubscriptionsRequestPhase = "validate" | "execute";
type AppstleSubscriptionsActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const appstleSubscriptionsActionHandlers: ProviderActionHandlers<
  "appstle_subscriptions",
  AppstleSubscriptionsActionHandler
> = {
  async list_customers_with_subscriptions(input, context) {
    const payload = await requestAppstleSubscriptionsJson({
      context,
      path: "/api/external/v2/subscription-contract-details/customers",
      phase: "execute",
      searchParams: buildListCustomersSearchParams(input),
    });

    return {
      customers: normalizeArray(payload),
    };
  },

  async get_customer_with_subscriptions(input, context) {
    const customerId = readPositiveInteger(input.customerId, "customerId");
    const searchParams = new URLSearchParams();
    appendSearchParam(searchParams, "cursor", input.cursor);
    const payload = await requestAppstleSubscriptionsJson({
      context,
      path: `/api/external/v2/subscription-customers/${customerId}`,
      phase: "execute",
      searchParams,
    });

    return {
      customer: payload ?? null,
    };
  },

  async get_valid_subscription_contract_ids(input, context) {
    const customerId = readPositiveInteger(input.customerId, "customerId");
    const payload = await requestAppstleSubscriptionsJson({
      context,
      path: `/api/external/v2/subscription-customers/valid/${customerId}`,
      phase: "execute",
    });

    return {
      contractIds: normalizeIntegerArray(payload),
    };
  },

  async list_customer_subscription_details(input, context) {
    const customerId = readPositiveInteger(input.customerId, "customerId");
    const payload = await requestAppstleSubscriptionsJson({
      context,
      path: `/api/external/v2/subscription-customers-detail/valid/${customerId}`,
      phase: "execute",
    });

    return {
      subscriptions: normalizeArray(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, appstleSubscriptionsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestAppstleSubscriptionsJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/api/external/v2/subscription-contract-details/customers",
      phase: "validate",
      searchParams: new URLSearchParams([
        ["page", "0"],
        ["size", "1"],
      ]),
    });

    return {
      profile: {
        displayName: "Appstle Subscriptions API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: appstleSubscriptionsApiBaseUrl,
        validationEndpoint: "/api/external/v2/subscription-contract-details/customers",
      },
    };
  },
};

async function requestAppstleSubscriptionsJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: AppstleSubscriptionsRequestPhase;
  searchParams?: URLSearchParams;
}): Promise<unknown> {
  const response = await requestAppstleSubscriptions(input);
  const payload = await readAppstleSubscriptionsPayload(response);
  if (response.ok) {
    return payload;
  }

  throw createAppstleSubscriptionsError(response.status, response.statusText, payload, input.phase);
}

async function requestAppstleSubscriptions(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  searchParams?: URLSearchParams;
}): Promise<Response> {
  const url = new URL(input.path, appstleSubscriptionsApiBaseUrl);
  for (const [key, value] of input.searchParams ?? []) {
    url.searchParams.append(key, value);
  }

  try {
    return await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-Key": input.context.apiKey,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Appstle Subscriptions request failed: ${error.message}`
        : "Appstle Subscriptions request failed",
    );
  }
}

async function readAppstleSubscriptionsPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAppstleSubscriptionsError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: AppstleSubscriptionsRequestPhase,
): ProviderRequestError {
  const message =
    extractAppstleSubscriptionsErrorMessage(payload) ?? statusText ?? "Appstle Subscriptions request failed";

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if ([400, 404, 415, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAppstleSubscriptionsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record =
    payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(record.path)
  );
}

function buildListCustomersSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  appendSearchParam(searchParams, "name", input.name);
  appendSearchParam(searchParams, "email", input.email);
  appendSearchParam(searchParams, "activeMoreThanOneSubscription", input.activeMoreThanOneSubscription);
  appendSearchParam(searchParams, "page", input.page ?? 0);
  appendSearchParam(searchParams, "size", input.size ?? 25);

  if (Array.isArray(input.sort)) {
    for (const sortItem of input.sort) {
      appendSearchParam(searchParams, "sort", sortItem);
    }
  }

  return searchParams;
}

function appendSearchParam(searchParams: URLSearchParams, key: string, value: unknown): void {
  if (value == null || value === "") {
    return;
  }

  searchParams.append(key, String(value));
}

function normalizeArray(payload: unknown): unknown[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.map((item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? compactObject({ ...(item as Record<string, unknown>) })
      : item,
  );
}

function normalizeIntegerArray(payload: unknown): number[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((item): item is number => typeof item === "number" && Number.isInteger(item));
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }

  return value;
}
