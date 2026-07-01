import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BaremetricsActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "baremetrics";
const baremetricsApiBaseUrl = "https://api.baremetrics.com";

type BaremetricsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type BaremetricsPhase = "validate" | "execute";

export const baremetricsActionHandlers: Record<BaremetricsActionName, BaremetricsActionHandler> = {
  list_sources(_input, context) {
    return listSources(context);
  },
  list_customers(input, context) {
    return listCustomers(input, context);
  },
  create_customer(input, context) {
    return customerMutation("POST", input, context);
  },
  update_customer(input, context) {
    return customerMutation("PUT", input, context);
  },
  list_plans(input, context) {
    return listPlans(input, context);
  },
  create_plan(input, context) {
    return planMutation("POST", input, context);
  },
  update_plan(input, context) {
    return planMutation("PUT", input, context);
  },
  list_subscriptions(input, context) {
    return listSubscriptions(input, context);
  },
  create_subscription(input, context) {
    return subscriptionMutation("POST", input, context);
  },
  update_subscription(input, context) {
    return subscriptionMutation("PUT", input, context);
  },
  cancel_subscription(input, context) {
    return cancelSubscription(input, context);
  },
  list_charges(input, context) {
    return listCharges(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: baremetricsActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await baremetricsGetJson("/v1/sources", {}, {
      apiKey: input.apiKey,
      fetcher,
      signal,
    }, "validate");
    const sources = readArray(payload, "sources");
    const firstSource = optionalRecord(sources[0]);
    const sourceId = optionalString(firstSource?.id);
    const provider = optionalString(firstSource?.provider);

    return {
      profile: {
        accountId: sourceId,
        displayName: provider ? `Baremetrics ${provider}` : "Baremetrics API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: baremetricsApiBaseUrl,
        validationEndpoint: "/v1/sources",
        sourceCount: sources.length,
        firstSourceId: sourceId,
        firstSourceProvider: provider,
      }),
    };
  },
};

async function listSources(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await baremetricsGetJson("/v1/sources", {}, context, "execute");
  return {
    sources: readArray(payload, "sources"),
    raw: asRecord(payload),
  };
}

async function listCustomers(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const payload = await baremetricsGetJson(
    `/v1/${encodeURIComponent(sourceId)}/customers`,
    compactObject({
      search: optionalString(input.search),
      sort: optionalString(input.sort),
      order: optionalString(input.order),
    }),
    context,
    "execute",
  );
  return {
    customers: readArray(payload, "customers"),
    raw: asRecord(payload),
  };
}

async function customerMutation(
  method: "POST" | "PUT",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const path =
    method === "POST"
      ? `/v1/${encodeURIComponent(sourceId)}/customers`
      : `/v1/${encodeURIComponent(sourceId)}/customers/${encodeURIComponent(requiredString(input.customerOid, "customerOid", invalidInputError))}`;
  const payload = await baremetricsSendJson(
    method,
    path,
    compactObject({
      oid: optionalString(input.oid),
      name: optionalString(input.name),
      email: optionalString(input.email),
      notes: optionalString(input.notes),
      created: optionalString(input.created),
    }),
    context,
  );
  return {
    customer: optionalRecord(asRecord(payload).customer) ?? null,
    raw: asRecord(payload),
  };
}

async function listPlans(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const payload = await baremetricsGetJson(
    `/v1/${encodeURIComponent(sourceId)}/plans`,
    compactObject({
      search: optionalString(input.search),
    }),
    context,
    "execute",
  );
  return {
    plans: readArray(payload, "plans"),
    raw: asRecord(payload),
  };
}

async function planMutation(
  method: "POST" | "PUT",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const path =
    method === "POST"
      ? `/v1/${encodeURIComponent(sourceId)}/plans`
      : `/v1/${encodeURIComponent(sourceId)}/plans/${encodeURIComponent(requiredString(input.planOid, "planOid", invalidInputError))}`;
  const payload = await baremetricsSendJson(
    method,
    path,
    compactObject({
      oid: optionalString(input.oid),
      name: optionalString(input.name),
      currency: optionalString(input.currency),
      amount: optionalNumber(input.amount),
      interval: optionalString(input.interval),
      interval_count: optionalNumber(input.intervalCount),
      trial_duration: optionalNumber(input.trialDuration),
      trial_duration_unit: optionalString(input.trialDurationUnit),
    }),
    context,
  );
  return {
    plan: optionalRecord(asRecord(payload).plan) ?? null,
    raw: asRecord(payload),
  };
}

async function listSubscriptions(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const payload = await baremetricsGetJson(
    `/v1/${encodeURIComponent(sourceId)}/subscriptions`,
    compactObject({
      customer_oid: optionalString(input.customerOid),
      order: optionalString(input.order),
    }),
    context,
    "execute",
  );
  return {
    subscriptions: readArray(payload, "subscriptions"),
    raw: asRecord(payload),
  };
}

async function subscriptionMutation(
  method: "POST" | "PUT",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const path =
    method === "POST"
      ? `/v1/${encodeURIComponent(sourceId)}/subscriptions`
      : `/v1/${encodeURIComponent(sourceId)}/subscriptions/${encodeURIComponent(requiredString(input.subscriptionOid, "subscriptionOid", invalidInputError))}`;
  const payload = await baremetricsSendJson(method, path, subscriptionBody(input), context);
  return normalizeSubscriptionPayload(payload);
}

async function cancelSubscription(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const payload = await baremetricsSendJson(
    "PUT",
    `/v1/${encodeURIComponent(sourceId)}/subscriptions/${encodeURIComponent(requiredString(input.subscriptionOid, "subscriptionOid", invalidInputError))}/cancel`,
    {
      canceled_at: requiredString(input.canceledAt, "canceledAt", invalidInputError),
    },
    context,
  );
  return normalizeSubscriptionPayload(payload);
}

async function listCharges(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const sourceId = requiredString(input.sourceId, "sourceId", invalidInputError);
  const payload = await baremetricsGetJson(
    `/v1/${encodeURIComponent(sourceId)}/charges`,
    compactObject({
      start: optionalString(input.start),
      end: optionalString(input.end),
      subscription_oid: optionalString(input.subscriptionOid),
      customer_oid: optionalString(input.customerOid),
    }),
    context,
    "execute",
  );
  return {
    charges: readArray(payload, "charges"),
    raw: asRecord(payload),
  };
}

function subscriptionBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    oid: optionalString(input.oid),
    started_at: optionalString(input.startedAt),
    canceled_at: optionalString(input.canceledAt),
    plan_oid: optionalString(input.planOid),
    customer_oid: optionalString(input.customerOid),
    addons: Array.isArray(input.addons) ? input.addons : undefined,
    quantity: optionalNumber(input.quantity),
    discount: optionalNumber(input.discount),
    occurred_at: optionalString(input.occurredAt),
  });
}

function normalizeSubscriptionPayload(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  return {
    subscription: optionalRecord(record.subscription) ?? null,
    event: optionalRecord(record.event) ?? null,
    raw: record,
  };
}

async function baremetricsGetJson(
  path: string,
  query: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: BaremetricsPhase,
): Promise<unknown> {
  const url = new URL(path, baremetricsApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  return baremetricsRequestJson(url, { method: "GET" }, context, phase);
}

async function baremetricsSendJson(
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return baremetricsRequestJson(
    new URL(path, baremetricsApiBaseUrl),
    {
      method,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    context,
    "execute",
  );
}

async function baremetricsRequestJson(
  url: URL,
  init: RequestInit,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: BaremetricsPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      ...init,
      headers: baremetricsHeaders(context.apiKey, init.headers),
      signal: context.signal,
    });
    payload = await readBaremetricsPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Baremetrics request failed: ${error.message}` : "Baremetrics request failed",
    );
  }

  if (!response.ok) {
    throw createBaremetricsError(response, payload, phase);
  }

  return payload;
}

function baremetricsHeaders(apiKey: string, extraHeaders?: HeadersInit): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...Object.fromEntries(new Headers(extraHeaders).entries()),
  };
}

async function readBaremetricsPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function createBaremetricsError(response: Response, payload: unknown, phase: BaremetricsPhase): ProviderRequestError {
  const message = extractBaremetricsErrorMessage(payload) ?? response.statusText;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message || "Baremetrics API key was rejected", payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message || "Baremetrics rate limit exceeded", payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message || "Baremetrics request failed", payload);
  }
  return new ProviderRequestError(502, message || "Baremetrics request failed", payload);
}

function extractBaremetricsErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function readArray(payload: unknown, key: string): unknown[] {
  const value = asRecord(payload)[key];
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
