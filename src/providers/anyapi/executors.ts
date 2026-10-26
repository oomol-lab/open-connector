import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { providerResponseError, providerUserAgent } from "../provider-runtime.ts";
import { anyapiActions } from "./actions.ts";
import { anyapiBaseUrl, executeAnyapiAction, requestAnyapi } from "./runtime.ts";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "anyapi",
  Object.fromEntries(
    anyapiActions.map((action) => [
      action.name,
      (values, context) => executeAnyapiAction(action.name, values, context.apiKey, context.fetcher, context.signal),
    ]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { payload } = await requestAnyapi("/v1/balance", input.apiKey, fetcher, { signal });
    if (optionalNumber(payload.usd) === undefined)
      throw providerResponseError("AnyAPI balance response is missing usd");
    return {
      profile: { displayName: "AnyAPI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: anyapiBaseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "anyapi",
  baseUrl: anyapiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  async customizeRequest({ headers: proxyHeaders }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "user-agent": providerUserAgent }))
      if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
  },
});
