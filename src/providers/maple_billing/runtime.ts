import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const mapleBillingApiBaseUrl = "https://api.getmeasure.com/api/v1";
const mapleBillingCredentialHelpUrl = "https://docs.getmeasure.com/pages/guides/quickstart-with-api";

type MapleBillingRequestPhase = "validate" | "execute";
type MapleBillingActionHandler = (
  input: Record<string, unknown>,
  context: MapleBillingActionContext,
) => Promise<unknown>;

interface MapleBillingRequestInput {
  apiKey: string;
  companyId: string;
  path: string;
  fetcher: typeof fetch;
  phase: MapleBillingRequestPhase;
  signal?: AbortSignal;
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  notFoundAsInvalidInput?: boolean;
}

export interface MapleBillingActionContext {
  apiKey: string;
  companyId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const mapleBillingActionHandlers: ProviderActionHandlers<"maple_billing", MapleBillingActionHandler> = {
  create_customer(input, context) {
    return createCustomer(input, context);
  },
  update_customer(input, context) {
    return updateCustomer(input, context);
  },
  find_customers(input, context) {
    return findCustomers(input, context);
  },
  get_customer(input, context) {
    return getCustomer(input, context);
  },
  find_products(input, context) {
    return findProducts(input, context);
  },
  get_product(input, context) {
    return getProduct(input, context);
  },
  find_product_pricing(input, context) {
    return findProductPricing(input, context);
  },
  get_product_pricing(input, context) {
    return getProductPricing(input, context);
  },
  find_subscriptions(input, context) {
    return findSubscriptions(input, context);
  },
  get_subscription(input, context) {
    return getSubscription(input, context);
  },
  create_checkout_session(input, context) {
    return createCheckoutSession(input, context);
  },
  get_checkout_session(input, context) {
    return getCheckoutSession(input, context);
  },
};

export async function validateMapleBillingCredential(
  input: { apiKey: string; values: Record<string, string> },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const companyId = normalizeMapleBillingCompanyId(input.values.companyId);
  const payload = await requestMapleBillingJson({
    apiKey: input.apiKey,
    companyId,
    path: "/customers/find",
    method: "POST",
    body: {
      pagination: {
        limit: 1,
      },
    },
    fetcher,
    signal,
    phase: "validate",
  });
  const firstCustomer = readListResults(payload, "customer")[0];

  return {
    profile: {
      accountId: `maple_billing:${companyId}`,
      displayName: `Measure ${companyId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      companyId,
      apiBaseUrl: buildMapleBillingApiBaseUrl(companyId),
      validationEndpoint: `/companies/${companyId}/customers/find`,
      credentialHelpUrl: mapleBillingCredentialHelpUrl,
      sampleCustomerId: optionalString(firstCustomer?.id),
      sampleCustomerIdentifier: optionalString(firstCustomer?.identifier),
    }),
  };
}

function normalizeMapleBillingCompanyId(value: unknown): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, "companyId is required");
  }
  if (!normalized.startsWith("cmp_") || normalized.length <= "cmp_".length) {
    throw new ProviderRequestError(400, "companyId must be a Measure company ID with the cmp_ prefix");
  }
  return normalized;
}

function buildMapleBillingApiBaseUrl(companyId: string): string {
  return `${mapleBillingApiBaseUrl}/companies/${encodeURIComponent(companyId)}`;
}

function createCustomer(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  return requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: "/customers",
    method: "POST",
    body: buildCustomerBody(input),
    idempotencyKey: optionalString(input.idempotencyKey),
    phase: "execute",
  }).then((payload) => ({ customer: normalizeCustomer(requireProviderRecord(payload, "Measure customer response")) }));
}

async function updateCustomer(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const customerId = requiredInputString(input.customerId, "customerId");
  const body = buildCustomerBody(input, ["customerId"]);
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "at least one customer field must be provided for update");
  }

  const payload = await requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: `/customers/${encodeURIComponent(customerId)}`,
    method: "PATCH",
    body,
    idempotencyKey: optionalString(input.idempotencyKey),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { customer: normalizeCustomer(requireProviderRecord(payload, "Measure customer response")) };
}

async function findCustomers(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const payload = await executeFind(input, context, "/customers/find");
  return {
    customers: readListResults(payload, "customer").map(normalizeCustomer),
    pagination: normalizePagination(readPagination(payload)),
  };
}

async function getCustomer(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const customerId = requiredInputString(input.customerId, "customerId");
  const payload = await requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: `/customers/${encodeURIComponent(customerId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { customer: normalizeCustomer(requireProviderRecord(payload, "Measure customer response")) };
}

async function findProducts(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const payload = await executeFind(input, context, "/products/find");
  return {
    products: readListResults(payload, "product").map(normalizeProduct),
    pagination: normalizePagination(readPagination(payload)),
  };
}

async function getProduct(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const productId = requiredInputString(input.productId, "productId");
  const payload = await requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: `/products/${encodeURIComponent(productId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { product: normalizeProduct(requireProviderRecord(payload, "Measure product response")) };
}

async function findProductPricing(
  input: Record<string, unknown>,
  context: MapleBillingActionContext,
): Promise<unknown> {
  const payload = await executeFind(input, context, "/pricing/find");
  return {
    productPricing: readListResults(payload, "product pricing").map(normalizeProductPricing),
    pagination: normalizePagination(readPagination(payload)),
  };
}

async function getProductPricing(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const productPricingId = requiredInputString(input.productPricingId, "productPricingId");
  const payload = await requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: `/pricing/${encodeURIComponent(productPricingId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return {
    productPricing: normalizeProductPricing(requireProviderRecord(payload, "Measure product pricing response")),
  };
}

async function findSubscriptions(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const payload = await executeFind(input, context, "/subscriptions/find");
  return {
    subscriptions: readListResults(payload, "subscription").map(normalizeSubscription),
    pagination: normalizePagination(readPagination(payload)),
  };
}

async function getSubscription(input: Record<string, unknown>, context: MapleBillingActionContext): Promise<unknown> {
  const subscriptionId = requiredInputString(input.subscriptionId, "subscriptionId");
  const payload = await requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return {
    subscription: normalizeSubscription(requireProviderRecord(payload, "Measure subscription response")),
  };
}

async function createCheckoutSession(
  input: Record<string, unknown>,
  context: MapleBillingActionContext,
): Promise<unknown> {
  const payload = await requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: "/checkout",
    method: "POST",
    body: buildCheckoutSessionBody(input),
    idempotencyKey: optionalString(input.idempotencyKey),
    phase: "execute",
  });
  return {
    checkoutSession: normalizeCheckoutSession(requireProviderRecord(payload, "Measure checkout session response")),
  };
}

async function getCheckoutSession(
  input: Record<string, unknown>,
  context: MapleBillingActionContext,
): Promise<unknown> {
  const checkoutSessionId = requiredInputString(input.checkoutSessionId, "checkoutSessionId");
  const payload = await requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path: `/checkout/${encodeURIComponent(checkoutSessionId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return {
    checkoutSession: normalizeCheckoutSession(requireProviderRecord(payload, "Measure checkout session response")),
  };
}

function executeFind(
  input: Record<string, unknown>,
  context: MapleBillingActionContext,
  path: string,
): Promise<unknown> {
  return requestMapleBillingJson({
    ...context,
    companyId: normalizeMapleBillingCompanyId(context.companyId),
    path,
    method: "POST",
    body: buildFindBody(input),
    phase: "execute",
  });
}

async function requestMapleBillingJson(input: MapleBillingRequestInput): Promise<unknown> {
  let response: Response;
  try {
    response = await mapleBillingFetch(input);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `maple_billing request failed: ${error.message}` : "maple_billing request failed",
      error,
    );
  }

  const payload = await readMapleBillingJson(response);
  if (!response.ok) {
    throw toMapleBillingError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload;
}

function mapleBillingFetch(input: MapleBillingRequestInput): Promise<Response> {
  const url = new URL(pathWithoutLeadingSlash(input.path), `${buildMapleBillingApiBaseUrl(input.companyId)}/`);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  });

  if (input.idempotencyKey) {
    headers.set("Idempotency-Key", input.idempotencyKey);
  }

  return input.fetcher(url.toString(), {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });
}

async function readMapleBillingJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function toMapleBillingError(
  response: Response,
  payload: unknown,
  phase: MapleBillingRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.error_msg) ??
    optionalString(record?.detail) ??
    `maple_billing request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function buildFindBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    include_meta: optionalBoolean(input.includeMeta),
    pagination: buildPaginationBody(input.pagination),
    query: optionalRecord(input.query),
    sort_key: optionalString(input.sortKey),
  });
}

function buildPaginationBody(value: unknown): Record<string, unknown> | undefined {
  const pagination = optionalRecord(value);
  if (!pagination) {
    return undefined;
  }
  return compactObject({
    from_key: optionalString(pagination.fromKey),
    limit: optionalInteger(pagination.limit),
  });
}

function buildCustomerBody(input: Record<string, unknown>, omitKeys: string[] = []): Record<string, unknown> {
  const omitted = new Set([...omitKeys, "idempotencyKey"]);
  return compactObject({
    address: omitted.has("address") ? undefined : optionalRecord(input.address),
    billing_emails: omitted.has("billingEmails") ? undefined : optionalStringArray(input.billingEmails),
    child_rollup_billing: omitted.has("childRollupBilling") ? undefined : optionalBoolean(input.childRollupBilling),
    email: omitted.has("email") ? undefined : optionalString(input.email),
    exclude_from_metrics: omitted.has("excludeFromMetrics") ? undefined : optionalBoolean(input.excludeFromMetrics),
    identifier: omitted.has("identifier") ? undefined : optionalString(input.identifier),
    locale: omitted.has("locale") ? undefined : optionalString(input.locale),
    metadata: omitted.has("metadata") ? undefined : optionalRecord(input.metadata),
    name: omitted.has("name") ? undefined : optionalString(input.name),
    org_name: omitted.has("orgName") ? undefined : optionalString(input.orgName),
    owner_id: omitted.has("ownerId") ? undefined : optionalString(input.ownerId),
    parent_customer_id: omitted.has("parentCustomerId") ? undefined : optionalString(input.parentCustomerId),
    phone: omitted.has("phone") ? undefined : optionalString(input.phone),
    tags: omitted.has("tags") ? undefined : optionalStringArray(input.tags),
    title: omitted.has("title") ? undefined : optionalString(input.title),
  });
}

function buildCheckoutSessionBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    auto_charges: optionalBoolean(input.autoCharges),
    auto_renews: optionalBoolean(input.autoRenews),
    bundle_pricing_id: optionalString(input.bundlePricingId),
    change_proration_type: optionalString(input.changeProrationType),
    change_reset_billing_anchor: optionalBoolean(input.changeResetBillingAnchor),
    change_timing: optionalString(input.changeTiming),
    config_items: objectArray(input.configItems, "configItems", providerInputError),
    customer_id: requiredInputString(input.customerId, "customerId"),
    discounts: optionalProviderObjectArray(input.discounts, "discounts"),
    metadata: optionalRecord(input.metadata),
    onetime_items: optionalProviderObjectArray(input.onetimeItems, "onetimeItems"),
    options: optionalRecord(input.options),
    previous_subscription_id: optionalString(input.previousSubscriptionId),
    product_pricing_ids: optionalStringArray(input.productPricingIds),
    term: optionalRecord(input.term),
    trial: optionalBoolean(input.trial),
    trial_term: optionalRecord(input.trialTerm),
    type: optionalString(input.type) ?? "CHECKOUT_SESSION",
  });
}

function readListResults(value: unknown, itemName: string): Array<Record<string, unknown>> {
  const record = requireProviderRecord(value, `Measure ${itemName} list response`);
  if (record.results == null) {
    return [];
  }
  if (!Array.isArray(record.results)) {
    throw new ProviderRequestError(502, `Measure ${itemName} list response results must be an array`, value);
  }
  return record.results.map((item) => requireProviderRecord(item, `Measure ${itemName} item`));
}

function readPagination(value: unknown): Record<string, unknown> {
  return optionalRecord(requireProviderRecord(value, "Measure list response").pagination) ?? {};
}

function normalizePagination(pagination: Record<string, unknown>): Record<string, unknown> {
  return {
    fromKey: optionalString(pagination.from_key) ?? null,
    limit: optionalInteger(pagination.limit) ?? null,
    raw: pagination,
  };
}

function normalizeCustomer(customer: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredOutputString(customer.id, "customer.id"),
    identifier: optionalString(customer.identifier) ?? null,
    displayName: optionalString(customer.display_name) ?? null,
    email: optionalString(customer.email) ?? null,
    orgName: optionalString(customer.org_name) ?? null,
    status: optionalString(customer.status) ?? null,
    raw: customer,
  };
}

function normalizeProduct(product: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredOutputString(product.id, "product.id"),
    name: optionalString(product.name) ?? null,
    externalName: optionalString(product.external_name) ?? null,
    state: optionalString(product.state) ?? null,
    raw: product,
  };
}

function normalizeProductPricing(productPricing: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredOutputString(productPricing.id, "product_pricing.id"),
    productId: optionalString(productPricing.product_id) ?? null,
    name: optionalString(productPricing.name) ?? optionalString(productPricing.external_name) ?? null,
    currency: optionalString(productPricing.currency) ?? null,
    state: optionalString(productPricing.state) ?? null,
    raw: productPricing,
  };
}

function normalizeSubscription(subscription: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredOutputString(subscription.id, "subscription.id"),
    customerId: optionalString(subscription.customer_id) ?? null,
    status: optionalString(subscription.status) ?? null,
    currency: optionalString(subscription.currency) ?? null,
    raw: subscription,
  };
}

function normalizeCheckoutSession(checkoutSession: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredOutputString(checkoutSession.id, "checkout_session.id"),
    url: optionalString(checkoutSession.url) ?? null,
    customerId: optionalString(checkoutSession.customer_id) ?? null,
    status: optionalString(checkoutSession.status) ?? null,
    raw: checkoutSession,
  };
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredOutputString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    (message) => new ProviderRequestError(502, `Measure response is missing ${fieldName}: ${message}`),
  );
}

function requireProviderRecord(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, (message) => new ProviderRequestError(502, message, value));
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return stringArray(value, "array", providerInputError).map((item, index) =>
    requiredInputString(item, `array[${index}]`),
  );
}

function optionalProviderObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return optionalObjectArray(value, fieldName, providerInputError);
}

function pathWithoutLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
