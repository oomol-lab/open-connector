import type { ExecutionContext, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { wttrInActionHandlers, wttrInApiBaseUrl } from "./runtime.ts";

const service = "wttr_in";

interface WttrInActionContext {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const executors: ProviderExecutors = defineProviderExecutors<WttrInActionContext>({
  service,
  handlers: wttrInActionHandlers,
  createContext(context: ExecutionContext, fetcher: typeof fetch): WttrInActionContext {
    return {
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wttrInApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
