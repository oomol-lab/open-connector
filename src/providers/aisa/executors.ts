import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { aisaActionRoutes } from "./routes.ts";
import { executeAisaAction, requestAisa } from "./runtime.ts";

const service = "aisa";
const aisaApiOrigin = "https://api.aisa.one";
const handlers = Object.fromEntries(
  Object.keys(aisaActionRoutes).map((name) => [
    name,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) => executeAisaAction(name, input, context),
  ]),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: aisaApiOrigin,
  auth: { type: "bearer" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/plain;q=0.9, */*;q=0.8");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await requestAisa(
        "/v1/credits/balance",
        new URLSearchParams(),
        { apiKey: input.apiKey, fetcher, signal },
        "validate",
      ),
    );
    if (!payload) throw new ProviderRequestError(502, "AIsa balance response must be an object");
    return {
      profile: { accountId: "api_key", displayName: "AIsa API Key" },
      grantedScopes: [],
      metadata: { apiOrigin: aisaApiOrigin },
    };
  },
};
