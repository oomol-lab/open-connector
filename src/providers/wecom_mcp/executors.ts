import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { createProviderFetch, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createWeComContext, toWeComExecutionError, validateWeComCredential, wecomActionHandlers } from "./runtime.ts";

const service = "wecom_mcp";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: wecomActionHandlers,
  mapError: toWeComExecutionError,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createWeComContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "WeCom MCP request failed",
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateWeComCredential(input.values, createProviderFetch({ fetch: fetcher }), signal);
  },
};
