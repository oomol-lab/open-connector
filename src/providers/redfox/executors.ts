import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import { ProviderRequestError, withRetryAfterSeconds } from "../provider-runtime.ts";
import { redfoxActions } from "./actions.ts";
import { redfoxRoutes } from "./routes.ts";
import { executeRedfoxAction, validateRedfoxCredential, redfoxApiBaseUrl } from "./runtime.ts";
const handlers = mapProviderActionHandlers(
  "redfox",
  redfoxActions,
  (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const values = { ...input };
    for (const [name, schema] of Object.entries(
      action.inputSchema.properties as Record<string, Record<string, unknown>>,
    )) {
      if (values[name] === undefined && schema.default !== undefined) values[name] = structuredClone(schema.default);
    }
    return executeRedfoxAction(redfoxRoutes[action.name]!, values, context);
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("redfox", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRedfoxCredential(input.values, fetcher, signal);
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "redfox",
  baseUrl: redfoxApiBaseUrl,
  auth: { type: "api_key_header", name: "REDFOX_API_KEY" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "RedFoxHub request failed"),
      withRetryAfterSeconds(response),
      "provider_error",
    );
  },
});
