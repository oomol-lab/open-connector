import type { ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
type Environment = "sandbox" | "production";
interface CheckoutContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
const validationCustomer = "oomol-connector-validation@invalid.example";
export async function createCheckoutContext(
  context: ExecutionContext,
  fetcher: typeof fetch,
): Promise<CheckoutContext> {
  const credential = await requireApiKeyCredential(context, "checkout_com");
  return {
    apiKey: credential.apiKey,
    apiBaseUrl: buildBase(environment(credential.values.environment), prefix(credential.values.prefix)),
    fetcher,
    signal: context.signal,
  };
}
export function resolveCheckoutBase(values: Record<string, string>): string {
  return buildBase(environment(values.environment), prefix(values.prefix));
}
export const checkoutComActionHandlers: ProviderActionHandlers<
  "checkout_com",
  (input: Record<string, unknown>, context: CheckoutContext) => Promise<unknown>
> = {
  async create_customer(input, context) {
    const payload = requiredObject(
      await request("/customers", "POST", customerBody(input), context, "execute"),
      "Checkout.com create customer response",
    );
    return { customer_id: requiredString(payload.id, "id", providerResponseError) };
  },
  async get_customer(input, context) {
    const identifier = requiredString(input.identifier, "identifier", providerInputError);
    const customer = requiredObject(
      await request(`/customers/${encodeURIComponent(identifier)}`, "GET", undefined, context, "execute"),
      "Checkout.com customer response",
    );
    requiredString(customer.id, "id", providerResponseError);
    requiredString(customer.email, "email", providerResponseError);
    return { customer };
  },
  async update_customer(input, context) {
    const id = requiredString(input.customer_id, "customer_id", providerInputError);
    await request(`/customers/${encodeURIComponent(id)}`, "PATCH", customerBody(input), context, "execute");
    return { updated: true };
  },
  async delete_customer(input, context) {
    const id = requiredString(input.customer_id, "customer_id", providerInputError);
    await request(`/customers/${encodeURIComponent(id)}`, "DELETE", undefined, context, "execute");
    return { deleted: true };
  },
};
export async function validateCheckout(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const env = environment(input.values.environment);
  const normalizedPrefix = prefix(input.values.prefix);
  const apiBaseUrl = buildBase(env, normalizedPrefix);
  await request(
    `/customers/${encodeURIComponent(validationCustomer)}`,
    "GET",
    undefined,
    { apiKey: input.apiKey, apiBaseUrl, fetcher, signal },
    "validate",
    true,
  );
  return {
    profile: {
      accountId: `${env}:${normalizedPrefix}`,
      displayName: env === "production" ? "Checkout.com Production API Key" : "Checkout.com Sandbox API Key",
    },
    grantedScopes: [],
    metadata: {
      environment: env,
      prefix: normalizedPrefix,
      apiBaseUrl,
      validationEndpoint: `/customers/${validationCustomer}`,
    },
  };
}
async function request(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown> | undefined,
  context: CheckoutContext,
  phase: "validate" | "execute",
  allowNotFound = false,
): Promise<unknown> {
  const response = await context.fetcher(new URL(path.slice(1), `${context.apiBaseUrl}/`), {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "Checkout.com returned invalid JSON");
    }
  }
  if (response.ok || (allowNotFound && response.status === 404 && response.headers.has("cko-request-id")))
    return payload;
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.error_type) ??
    (Array.isArray(record?.error_codes) ? record.error_codes.join(", ") : undefined) ??
    `Checkout.com request failed with status ${response.status}`;
  if (response.status === 429) throw new ProviderRequestError(429, message);
  if (phase === "validate" && response.status < 500) throw new ProviderRequestError(400, message);
  if (response.status === 401 || response.status === 403) throw new ProviderRequestError(401, message);
  throw new ProviderRequestError(response.status < 500 ? 400 : 502, message);
}
function customerBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    email: optionalString(input.email),
    name: optionalString(input.name),
    phone: input.phone,
    metadata: input.metadata,
    default: optionalString(input.default),
  });
}
function environment(value: unknown): Environment {
  if (value === "sandbox" || value === "production") return value;
  throw new ProviderRequestError(400, "environment must be sandbox or production");
}
function prefix(value: unknown): string {
  const result = requiredString(value, "prefix", providerInputError).toLowerCase();
  if (result.length !== 8 || ![...result].every(isLowercaseLetterOrDigit))
    throw new ProviderRequestError(400, "prefix must contain exactly 8 lowercase letters or digits");
  return result;
}
function isLowercaseLetterOrDigit(character: string): boolean {
  return (character >= "a" && character <= "z") || (character >= "0" && character <= "9");
}
function buildBase(env: Environment, value: string): string {
  return `https://${value}.${env === "production" ? "api" : "api.sandbox"}.checkout.com`;
}
function requiredObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} was invalid`);
  return record;
}
