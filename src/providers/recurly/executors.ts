import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { RecurlyActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "recurly";
const recurlyApiBaseUrl = "https://v3.recurly.com";
const recurlyApiKeyHelpUrl = "https://app.recurly.com/go/developer/api_keys";

type RecurlyQueryValue = string | number | boolean | readonly string[] | undefined;
type RecurlyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface RecurlyListPayload {
  data: unknown[];
  has_more?: unknown;
  next?: unknown;
}

export const recurlyActionHandlers: Record<RecurlyActionName, RecurlyActionHandler> = {
  async list_accounts(input, context) {
    const payload = await requestRecurlyList(input, context, "/accounts", {
      ...buildCommonListQuery(input),
      email: optionalString(input.email),
      subscriber: optionalBoolean(input.subscriber),
      past_due: input.pastDue === true ? "true" : undefined,
    });
    return {
      accounts: payload.data.map((item) => normalizeAccount(requireRecord(item, "account"))),
      hasMore: optionalBoolean(payload.has_more) ?? false,
      next: optionalString(payload.next) ?? null,
    };
  },
  async get_account(input, context) {
    const accountId = requiredInputString(input.accountId, "accountId");
    const payload = await requestRecurlyJson({
      path: `/accounts/${encodeURIComponent(accountId)}`,
      context,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return { account: normalizeAccount(requireRecord(payload, "account")) };
  },
  async create_account(input, context) {
    const payload = await requestRecurlyJson({
      path: "/accounts",
      method: "POST",
      body: buildAccountBody(input),
      context,
      mode: "execute",
    });
    return { account: normalizeAccount(requireRecord(payload, "account")) };
  },
  async update_account(input, context) {
    const accountId = requiredInputString(input.accountId, "accountId");
    const payload = await requestRecurlyJson({
      path: `/accounts/${encodeURIComponent(accountId)}`,
      method: "PUT",
      body: buildAccountBody(input),
      context,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return { account: normalizeAccount(requireRecord(payload, "account")) };
  },
  async list_plans(input, context) {
    const payload = await requestRecurlyList(input, context, "/plans", {
      ...buildCommonListQuery(input),
      state: optionalString(input.state),
    });
    return {
      plans: payload.data.map((item) => normalizePlan(requireRecord(item, "plan"))),
      hasMore: optionalBoolean(payload.has_more) ?? false,
      next: optionalString(payload.next) ?? null,
    };
  },
  async get_plan(input, context) {
    const planId = requiredInputString(input.planId, "planId");
    const payload = await requestRecurlyJson({
      path: `/plans/${encodeURIComponent(planId)}`,
      context,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return { plan: normalizePlan(requireRecord(payload, "plan")) };
  },
  async create_plan(input, context) {
    const payload = await requestRecurlyJson({
      path: "/plans",
      method: "POST",
      body: buildPlanBody(input),
      context,
      mode: "execute",
    });
    return { plan: normalizePlan(requireRecord(payload, "plan")) };
  },
  async list_subscriptions(input, context) {
    const payload = await requestRecurlyList(input, context, "/subscriptions", {
      ...buildCommonListQuery(input),
      state: optionalString(input.state),
    });
    return {
      subscriptions: payload.data.map((item) => normalizeSubscription(requireRecord(item, "subscription"))),
      hasMore: optionalBoolean(payload.has_more) ?? false,
      next: optionalString(payload.next) ?? null,
    };
  },
  async get_subscription(input, context) {
    const subscriptionId = requiredInputString(input.subscriptionId, "subscriptionId");
    const payload = await requestRecurlyJson({
      path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      context,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return { subscription: normalizeSubscription(requireRecord(payload, "subscription")) };
  },
  async create_subscription(input, context) {
    const payload = await requestRecurlyJson({
      path: "/subscriptions",
      method: "POST",
      body: buildSubscriptionBody(input),
      context,
      mode: "execute",
    });
    return { subscription: normalizeSubscription(requireRecord(payload, "subscription")) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, recurlyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: recurlyApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export async function validateRecurlyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestRecurlyJson({
    path: "/accounts",
    query: { limit: 1 },
    context: { apiKey, fetcher, signal },
    mode: "validate",
  });
  const listPayload = normalizeListPayload(payload, "account");
  const firstAccount = listPayload.data.map(optionalRecord).find((item) => item != null);
  const siteId = optionalString(firstAccount?.site_id);
  const accountCode = optionalString(firstAccount?.code);
  return {
    profile: {
      accountId: siteId ? `recurly:${siteId}` : "recurly",
      displayName: siteId ? `Recurly ${siteId}` : "Recurly API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: recurlyApiBaseUrl,
      validationEndpoint: "/accounts?limit=1",
      credentialHelpUrl: recurlyApiKeyHelpUrl,
      sampleAccountId: optionalString(firstAccount?.id),
      sampleAccountCode: accountCode,
      siteId,
    },
  };
}

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRecurlyCredential({ apiKey: input.apiKey, ...input.values }, fetcher, signal);
  },
};

async function requestRecurlyList(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  query: Record<string, RecurlyQueryValue>,
): Promise<RecurlyListPayload> {
  const nextPath = optionalString(input.nextPath);
  const payload = await requestRecurlyJson({
    path: nextPath ?? path,
    query: nextPath ? undefined : query,
    context,
    mode: "execute",
  });
  return normalizeListPayload(payload, path);
}

async function requestRecurlyJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, RecurlyQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildRecurlyUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: buildBasicAuthHeader(input.context.apiKey),
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `recurly request failed: ${error.message}` : "recurly request failed",
    );
  }

  const payload = await readRecurlyJson(response);
  if (!response.ok) {
    throw toRecurlyError(response, payload, input.mode, input.notFoundAsInvalidInput === true);
  }
  return payload;
}

function buildRecurlyUrl(path: string, query?: Record<string, RecurlyQueryValue>): string {
  const url = new URL(path.replace(/^\/+/, ""), `${recurlyApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return url.toString();
}

function buildBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function readRecurlyJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function toRecurlyError(
  response: Response,
  payload: unknown,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.type) ??
    `recurly request failed with ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 401) return new ProviderRequestError(mode === "validate" ? 401 : 403, message, payload);
  if (response.status === 403) return new ProviderRequestError(mode === "validate" ? 401 : 403, message, payload);
  if (response.status === 404 && notFoundAsInvalidInput) return new ProviderRequestError(400, message, payload);
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : 400, message, payload);
}

function normalizeListPayload(value: unknown, itemName: string): RecurlyListPayload {
  const record = optionalRecord(value);
  if (!record || !Array.isArray(record.data)) {
    throw new ProviderRequestError(502, `Recurly ${itemName} list response must include a data array`);
  }
  return {
    data: record.data,
    has_more: record.has_more,
    next: record.next,
  };
}

function normalizeAccount(account: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredOutputString(account.id, "account.id"),
    code: optionalString(account.code) ?? null,
    email: optionalString(account.email) ?? null,
    firstName: optionalString(account.first_name) ?? null,
    lastName: optionalString(account.last_name) ?? null,
    company: optionalString(account.company) ?? null,
    state: optionalString(account.state) ?? null,
    hasLiveSubscription: optionalBoolean(account.has_live_subscription) ?? null,
    hasPastDueInvoice: optionalBoolean(account.has_past_due_invoice) ?? null,
    createdAt: optionalString(account.created_at) ?? null,
    updatedAt: optionalString(account.updated_at) ?? null,
    raw: account,
  };
}

function normalizePlan(plan: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredOutputString(plan.id, "plan.id"),
    code: requiredOutputString(plan.code, "plan.code"),
    name: requiredOutputString(plan.name, "plan.name"),
    state: optionalString(plan.state) ?? null,
    pricingModel: optionalString(plan.pricing_model) ?? null,
    intervalUnit: optionalString(plan.interval_unit) ?? null,
    intervalLength: optionalInteger(plan.interval_length) ?? null,
    createdAt: optionalString(plan.created_at) ?? null,
    updatedAt: optionalString(plan.updated_at) ?? null,
    raw: plan,
  };
}

function normalizeSubscription(subscription: Record<string, unknown>): Record<string, unknown> {
  const account = optionalRecord(subscription.account);
  const plan = optionalRecord(subscription.plan);
  return {
    id: requiredOutputString(subscription.id, "subscription.id"),
    uuid: optionalString(subscription.uuid) ?? null,
    state: optionalString(subscription.state) ?? null,
    accountId: optionalString(account?.id) ?? null,
    accountCode: optionalString(account?.code) ?? null,
    planId: optionalString(plan?.id) ?? null,
    planCode: optionalString(plan?.code) ?? null,
    currency: optionalString(subscription.currency) ?? null,
    unitAmount: optionalNumber(subscription.unit_amount) ?? null,
    quantity: optionalInteger(subscription.quantity) ?? null,
    currentPeriodEndsAt: optionalString(subscription.current_period_ends_at) ?? null,
    createdAt: optionalString(subscription.created_at) ?? null,
    updatedAt: optionalString(subscription.updated_at) ?? null,
    raw: subscription,
  };
}

function buildCommonListQuery(input: Record<string, unknown>): Record<string, RecurlyQueryValue> {
  return compactObject({
    ids: readOptionalStringArray(input.ids, "ids"),
    limit: optionalInteger(input.limit),
    order: optionalString(input.order),
    sort: optionalString(input.sort),
    begin_time: optionalString(input.beginTime),
    end_time: optionalString(input.endTime),
  });
}

function buildAccountBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    code: optionalString(input.code),
    username: optionalString(input.username),
    email: optionalString(input.email),
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    company: optionalString(input.company),
    vat_number: optionalString(input.vatNumber),
    tax_exempt: optionalBoolean(input.taxExempt),
    preferred_locale: optionalString(input.preferredLocale),
    preferred_time_zone: optionalString(input.preferredTimeZone),
    address: buildAddress(input.address),
  });
}

function buildAddress(value: unknown): Record<string, unknown> | undefined {
  const address = optionalRecord(value);
  if (!address) return undefined;
  return compactObject({
    street1: optionalString(address.street1),
    street2: optionalString(address.street2),
    city: optionalString(address.city),
    region: optionalString(address.region),
    postal_code: optionalString(address.postalCode),
    country: optionalString(address.country),
    phone: optionalString(address.phone),
  });
}

function buildPlanBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    code: optionalString(input.code),
    name: optionalString(input.name),
    currencies: readCurrencyBodies(input.currencies),
    interval_unit: optionalString(input.intervalUnit),
    interval_length: optionalInteger(input.intervalLength),
    trial_unit: optionalString(input.trialUnit),
    trial_length: optionalInteger(input.trialLength),
    description: optionalString(input.description),
  });
}

function buildSubscriptionBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    plan_code: optionalString(input.planCode),
    currency: optionalString(input.currency),
    account: {
      code: requiredInputString(input.accountCode, "accountCode"),
    },
    quantity: optionalInteger(input.quantity),
    unit_amount: optionalNumber(input.unitAmount),
    collection_method: optionalString(input.collectionMethod),
    po_number: optionalString(input.poNumber),
  });
}

function readCurrencyBodies(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    const currency = requireRecord(item, "currency");
    return {
      currency: optionalString(currency.currency),
      unit_amount: optionalNumber(currency.unitAmount),
    };
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `Recurly response is missing ${label} object`);
  return record;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredOutputString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Recurly response is missing ${fieldName}`),
  );
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  return value.map((item) => String(item));
}
