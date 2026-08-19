import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";
type Context = Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1];
async function request(
  path: string,
  method: string,
  input: Record<string, unknown>,
  context: Context,
): Promise<unknown> {
  const url = new URL(path, "https://api.sumup.com");
  if (method === "GET")
    for (const [key, value] of Object.entries(input)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: method === "GET" ? undefined : JSON.stringify(input),
    signal: context.signal,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok)
    throw new ProviderRequestError(response.status, `SumUp request failed with status ${response.status}`, payload);
  return payload;
}
const handlers: ProviderActionHandlers<"sumup", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async create_customer(input, context) {
    return { customer: await request("/v0.1/customers", "POST", input, context) };
  },
  async get_customer(input, context) {
    return {
      customer: await request(`/v0.1/customers/${encodeURIComponent(String(input.customer_id))}`, "GET", {}, context),
    };
  },
  async update_customer(input, context) {
    return {
      customer: await request(
        `/v0.1/customers/${encodeURIComponent(String(input.customer_id))}`,
        "PUT",
        { personal_details: input.personal_details },
        context,
      ),
    };
  },
  async list_payment_instruments(input, context) {
    return {
      payment_instruments: await request(
        `/v0.1/customers/${encodeURIComponent(String(input.customer_id))}/payment-instruments`,
        "GET",
        {},
        context,
      ),
    };
  },
  async create_checkout(input, context) {
    return { checkout: await request("/v0.1/checkouts", "POST", input, context) };
  },
  async get_checkout(input, context) {
    return {
      checkout: await request(`/v0.1/checkouts/${encodeURIComponent(String(input.checkout_id))}`, "GET", {}, context),
    };
  },
  async list_checkouts(input, context) {
    return { checkouts: await request("/v0.1/checkouts", "GET", input, context) };
  },
  async deactivate_checkout(input, context) {
    return {
      checkout: await request(
        `/v0.1/checkouts/${encodeURIComponent(String(input.checkout_id))}`,
        "DELETE",
        {},
        context,
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("sumup", handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "sumup",
  baseUrl: "https://api.sumup.com",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const validationEndpoint = "/v0.1/checkouts";
    const url = new URL(validationEndpoint, "https://api.sumup.com");
    url.searchParams.set("checkout_reference", "open-connector-credential-validation");
    const response = await fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok && response.status !== 403) {
      const text = await response.text();
      throw new ProviderRequestError(
        response.status,
        text || `SumUp credential validation failed with ${response.status}`,
      );
    }
    return {
      profile: { accountId: "api_key", displayName: "SumUp API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: "https://api.sumup.com", validationEndpoint },
    };
  },
};
