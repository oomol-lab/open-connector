import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "ablefy";
const baseUrl = "https://api.myablefy.com/api";
interface Context {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

async function request(path: string, context: Context): Promise<unknown> {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("key", context.apiKey);
  url.searchParams.set("secret", context.apiSecret);
  const response = await context.fetcher(url, {
    headers: { accept: "application/json", "user-agent": providerUserAgent },
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "ablefy returned a non-JSON response");
    payload = { message: text };
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      optionalString(optionalRecord(payload)?.message) ??
        optionalString(optionalRecord(payload)?.error) ??
        `ablefy request failed (${response.status})`,
      payload,
    );
  return payload;
}

const handlers = {
  get_account: (_input: Record<string, unknown>, context: Context) =>
    request("/me", context).then((data) => ({ data })),
  list_products: (_input: Record<string, unknown>, context: Context) =>
    request("/products", context).then((data) => ({ data })),
  get_product: (input: Record<string, unknown>, context: Context) =>
    request(`/products/${input.id}`, context).then((data) => ({ data })),
  list_pricing_plans: (_input: Record<string, unknown>, context: Context) =>
    request("/pricing_plans", context).then((data) => ({ data })),
  get_pricing_plan: (input: Record<string, unknown>, context: Context) =>
    request(`/pricing_plans/${input.id}`, context).then((data) => ({ data })),
};

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: requiredString(credential.values.apiSecret, "apiSecret", providerInputError),
      fetcher,
      signal: context.signal,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_query", name: "key" },
  skipDnsValidation: true,
  async customizeRequest({ context, url, headers }) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType !== "api_key")
      throw providerInputError("ablefy api_key credential is required");
    url.searchParams.set("secret", requiredString(credential.values.apiSecret, "apiSecret", providerInputError));
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account =
      optionalRecord(
        await request("/me", {
          apiKey: input.apiKey,
          apiSecret: requiredString(input.values.apiSecret, "apiSecret", providerInputError),
          fetcher,
          signal,
        }),
      ) ?? {};
    return {
      profile: {
        accountId: "api_key",
        displayName:
          optionalString(account.name) ??
          optionalString(account.email) ??
          optionalString(account.username) ??
          "ablefy API Key",
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/api/me" },
    };
  },
};
