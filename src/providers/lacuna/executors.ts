import type { ExecutionContext, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { LacunaActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, providerFetch } from "../provider-runtime.ts";
import { lacunaActionHandlers, lacunaBaseUrl, skipRetryDelay, sleepBeforeRetry } from "./runtime.ts";

export const executors: ProviderExecutors = defineProviderExecutors<LacunaActionContext>({
  service: "lacuna",
  handlers: lacunaActionHandlers,
  createContext(context: ExecutionContext, fetcher: ProviderFetch): LacunaActionContext {
    return {
      fetcher,
      signal: context.signal,
      // Real Retry-After backoff applies to the shared production fetcher; test
      // stubs pass a different fetcher and skip the wait.
      sleep: fetcher === providerFetch ? sleepBeforeRetry : skipRetryDelay,
    };
  },
  fallbackMessage: "Lacuna request failed.",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "lacuna",
  baseUrl: lacunaBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
