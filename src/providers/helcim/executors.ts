import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const baseUrl = "https://api.helcim.com/v2";
async function request(
  input: Record<string, unknown>,
  context: Parameters<Parameters<typeof defineApiKeyProviderExecutors>[1][string]>[1],
  method: string,
  path: string,
): Promise<unknown> {
  const response = await context.fetcher(new URL(path, `${baseUrl}/`), {
    method,
    headers: {
      accept: "application/json",
      "api-token": context.apiKey,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: method === "GET" ? undefined : JSON.stringify(input),
    signal: context.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new ProviderRequestError(response.status, `Helcim request failed with status ${response.status}`, payload);
  return payload;
}
const handlers: ProviderActionHandlers<"helcim", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_customers(input, context) {
    const url = new URL("customers", `${baseUrl}/`);
    for (const [key, value] of Object.entries(input))
      if (value !== undefined)
        url.searchParams.set(key, key === "includeCards" ? (value ? "yes" : "no") : String(value));
    const response = await context.fetcher(url, { headers: { "api-token": context.apiKey }, signal: context.signal });
    const payload = await response.json();
    if (!response.ok) throw new ProviderRequestError(response.status, "Helcim list customers failed", payload);
    return { customers: payload };
  },
  async get_customer(input, context) {
    return { customer: await request({}, context, "GET", `customers/${input.customerId}`) };
  },
  async create_customer(input, context) {
    if (!input.contactName && !input.businessName)
      throw new ProviderRequestError(400, "Helcim requires contactName, businessName, or both");
    return { customer: await request(input, context, "POST", "customers") };
  },
  async update_customer(input, context) {
    const { customerId, ...body } = input;
    return { customer: await request(body, context, "PUT", `customers/${customerId}`) };
  },
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineApiKeyProviderExecutors(
  "helcim",
  handlers,
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "helcim",
  baseUrl,
  auth: { type: "api_key_header", name: "api-token" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = (await request({}, { apiKey: input.apiKey, fetcher, signal }, "GET", "connection-test")) as Record<
      string,
      unknown
    >;
    return {
      profile: { accountId: "api_key", displayName: "Helcim API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/connection-test", connectionMessage: payload.message },
    };
  },
};
