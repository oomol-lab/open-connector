import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineProviderProxy,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

interface Context {
  webApiKey: string;
  appKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
async function request(path: string, body: Record<string, unknown>, context: Context): Promise<unknown> {
  const response = await context.fetcher(new URL(path, "https://v2.api.finerworks.com"), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      web_api_key: context.webApiKey,
      app_key: context.appKey,
      "user-agent": providerUserAgent,
    },
    body: JSON.stringify(body),
    signal: context.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload)
    throw new ProviderRequestError(response.status || 502, "FinerWorks request failed", payload);
  return payload;
}
const handlers: ProviderActionHandlers<"finerworks", ProviderRuntimeHandler<Context>> = {
  list_product_types: (input, context) => request("/v3/list_product_types", input, context),
  list_media_types: (input, context) => request("/v3/list_media_types", input, context),
  list_style_types: (input, context) => request("/v3/list_style_types", input, context),
  get_prices: (input, context) => request("/v3/get_prices", input, context),
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineProviderExecutors<Context>({
  service: "finerworks",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "finerworks");
    const appKey = credential.values.appKey;
    if (!appKey) throw new ProviderRequestError(401, "Configure the FinerWorks app key first.");
    return { webApiKey: credential.apiKey, appKey, fetcher, signal: context.signal };
  },
  handlers,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "finerworks",
  baseUrl: "https://v2.api.finerworks.com",
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, "finerworks");
    const appKey = credential.values.appKey;
    if (!appKey) throw new ProviderRequestError(401, "Configure the FinerWorks app key first.");
    headers.set("web_api_key", credential.apiKey);
    headers.set("app_key", appKey);
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const appKey = input.values.appKey;
    if (!appKey) throw new ProviderRequestError(400, "appKey is required");
    await request("/v3/list_product_types", {}, { webApiKey: input.apiKey, appKey, fetcher, signal });
    return {
      profile: { accountId: "api_key", displayName: "FinerWorks API Account" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://v2.api.finerworks.com",
        validationEndpoint: "/v3/list_product_types",
        validationMode: "product_catalog_read",
      },
    };
  },
};
