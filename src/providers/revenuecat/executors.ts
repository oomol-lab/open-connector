import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "revenuecat";
const revenueCatApiBaseUrl = "https://api.revenuecat.com";

type RevenueCatPhase = "validate" | "execute";
type RevenueCatActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RevenueCatQueryValue = string | number | boolean | string[] | undefined;

interface RevenueCatList {
  object: string;
  items: unknown[];
  nextPage: string | null;
  url: string;
}

export const revenueCatActionHandlers: Record<string, RevenueCatActionHandler> = {
  list_projects(input, context) {
    return listRevenueCatResource("/v2/projects", input, context, "projects");
  },
  list_customers(input, context) {
    return listRevenueCatResource(`/v2/projects/${projectId(input)}/customers`, input, context, "customers", {
      search: optionalString(input.search),
    });
  },
  get_customer(input, context) {
    return getRevenueCatResource(
      `/v2/projects/${projectId(input)}/customers/${customerId(input)}`,
      context,
      "customer",
      { expand: optionalStringArray(input.expand) },
    );
  },
  list_customer_subscriptions(input, context) {
    return listRevenueCatResource(
      `/v2/projects/${projectId(input)}/customers/${customerId(input)}/subscriptions`,
      input,
      context,
      "customer subscriptions",
    );
  },
  get_subscription(input, context) {
    return getRevenueCatResource(
      `/v2/projects/${projectId(input)}/subscriptions/${subscriptionId(input)}`,
      context,
      "subscription",
    );
  },
  search_subscriptions(input, context) {
    return listRevenueCatResource(
      `/v2/projects/${projectId(input)}/subscriptions`,
      input,
      context,
      "subscriptions",
      {
        store_subscription_identifier: requiredString(
          input.storeSubscriptionIdentifier,
          "storeSubscriptionIdentifier",
          inputError,
        ),
        include_scheduled: optionalBoolean(input.includeScheduled),
      },
      false,
    );
  },
  list_customer_active_entitlements(input, context) {
    return listRevenueCatResource(
      `/v2/projects/${projectId(input)}/customers/${customerId(input)}/active_entitlements`,
      input,
      context,
      "active customer entitlements",
    );
  },
  list_entitlements(input, context) {
    return listRevenueCatResource(`/v2/projects/${projectId(input)}/entitlements`, input, context, "entitlements");
  },
  list_offerings(input, context) {
    return listRevenueCatResource(`/v2/projects/${projectId(input)}/offerings`, input, context, "offerings", {
      expand: optionalStringArray(input.expand),
    });
  },
  list_products(input, context) {
    return listRevenueCatResource(`/v2/projects/${projectId(input)}/products`, input, context, "products");
  },
  get_overview_metrics(input, context) {
    return getRevenueCatResource(`/v2/projects/${projectId(input)}/metrics/overview`, context, "metrics", {
      currency: optionalString(input.currency),
    });
  },
  get_revenue_metric(input, context) {
    return getRevenueCatResource(`/v2/projects/${projectId(input)}/metrics/revenue`, context, "metric", {
      start_date: requiredString(input.startDate, "startDate", inputError),
      end_date: requiredString(input.endDate, "endDate", inputError),
      currency: optionalString(input.currency),
      revenue_type: optionalString(input.revenueType),
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, revenueCatActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const response = await requestRevenueCat(
      "/v2/projects",
      { apiKey: input.apiKey, fetcher, signal },
      { limit: 1 },
      "validate",
    );
    const page = readRevenueCatList(response, "projects");
    const firstProject = optionalRecord(page.items[0]);

    return {
      profile: {
        accountId: "revenuecat-api-key",
        displayName: "RevenueCat API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: revenueCatApiBaseUrl,
        apiVersion: "v2",
        validationEndpoint: "/v2/projects",
        firstProjectId: optionalString(firstProject?.id),
      }),
    };
  },
};

async function listRevenueCatResource(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  resourceName: string,
  extraQuery: Record<string, RevenueCatQueryValue> = {},
  includePagination = true,
): Promise<RevenueCatList> {
  const response = await requestRevenueCat(
    path,
    context,
    {
      ...(includePagination
        ? {
            starting_after: optionalString(input.startingAfter),
            limit: optionalInteger(input.limit),
          }
        : {}),
      ...extraQuery,
    },
    "execute",
  );
  return readRevenueCatList(response, resourceName);
}

async function getRevenueCatResource(
  path: string,
  context: ApiKeyProviderContext,
  resourceName: string,
  query: Record<string, RevenueCatQueryValue> = {},
): Promise<Record<string, unknown>> {
  const response = await requestRevenueCat(path, context, query, "execute");
  const record = requiredRecord(response, `RevenueCat ${resourceName} response`, providerResponseError);
  return { [resourceName]: record };
}

async function requestRevenueCat(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  query: Record<string, RevenueCatQueryValue>,
  phase: RevenueCatPhase,
): Promise<unknown> {
  const url = new URL(path, revenueCatApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readRevenueCatPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `RevenueCat request failed: ${error.message}` : "RevenueCat request failed",
    );
  }

  if (!response.ok) {
    const status = phase === "validate" && (response.status === 401 || response.status === 403) ? 400 : response.status;
    throw new ProviderRequestError(status || 502, extractRevenueCatError(payload, response.status), payload);
  }

  return payload;
}

async function readRevenueCatPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "RevenueCat returned invalid JSON");
    return text;
  }
}

function readRevenueCatList(payload: unknown, resourceName: string): RevenueCatList {
  const record = requiredRecord(payload, `RevenueCat ${resourceName} response`, providerResponseError);
  if (!Array.isArray(record.items)) {
    throw new ProviderRequestError(502, `RevenueCat ${resourceName} response is missing items`);
  }

  return {
    object: optionalString(record.object) ?? "list",
    items: record.items,
    nextPage: optionalString(record.next_page) ?? null,
    url: requiredString(record.url, `RevenueCat ${resourceName} response url`, providerResponseError),
  };
}

function extractRevenueCatError(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return `RevenueCat request failed with HTTP ${status || 500}`;
  return (
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.type) ??
    `RevenueCat request failed with HTTP ${status || 500}`
  );
}

function projectId(input: Record<string, unknown>): string {
  return encodePathSegment(requiredString(input.projectId, "projectId", inputError));
}

function customerId(input: Record<string, unknown>): string {
  return encodePathSegment(requiredString(input.customerId, "customerId", inputError));
}

function subscriptionId(input: Record<string, unknown>): string {
  return encodePathSegment(requiredString(input.subscriptionId, "subscriptionId", inputError));
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return requiredStringArray(value, "expand", inputError);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
