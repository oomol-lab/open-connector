import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeSkyvernAction, validateSkyvernCredential } from "./runtime.ts";

const service = "skyvern";
const handlers: ProviderActionHandlers<
  "skyvern",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  run_task: (input, context) => executeSkyvernAction("run_task", input, context.apiKey, context.fetcher),
  get_run: (input, context) => executeSkyvernAction("get_run", input, context.apiKey, context.fetcher),
  list_runs: (input, context) => executeSkyvernAction("list_runs", input, context.apiKey, context.fetcher),
  cancel_run: (input, context) => executeSkyvernAction("cancel_run", input, context.apiKey, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    await validateSkyvernCredential(input.apiKey, fetcher);
    return { profile: { displayName: "Skyvern API Key" }, grantedScopes: [], metadata: {} };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.skyvern.com",
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});
