import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BigmlContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { bigmlActionHandlers, bigmlApiBaseUrl, validateBigmlCredential } from "./runtime.ts";

const service = "bigml";
export const executors: ProviderExecutors = defineProviderExecutors<BigmlContext>({
  service,
  handlers: bigmlActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BigmlContext> {
    const credential = await requireApiKeyCredential(context, service);
    const username = optionalString(credential.values.username)?.trim();
    if (!username) throw new ProviderRequestError(400, "username is required");
    return { apiKey: credential.apiKey, username, fetcher, signal: context.signal };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bigmlApiBaseUrl,
  auth: { type: "api_key_query", name: "api_key" },
  customizeRequest({ url, headers, credential }) {
    const username =
      credential && "values" in credential ? optionalString(credential.values.username)?.trim() : undefined;
    if (!username) throw new ProviderRequestError(400, "username is required");
    url.searchParams.set("username", username);
    headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBigmlCredential(input.apiKey, input.values.username, fetcher, signal);
  },
};
