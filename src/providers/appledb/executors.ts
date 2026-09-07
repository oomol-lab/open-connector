import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { AppleDbActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { appledbActionHandlers } from "./runtime.ts";

const service = "appledb";
const appledbBaseUrl = "https://api.appledb.dev";

export const executors: ProviderExecutors = defineProviderExecutors<AppleDbActionContext>({
  service,
  handlers: appledbActionHandlers,
  skipDnsValidation: true,
  createContext(context, fetcher): AppleDbActionContext {
    return {
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: appledbBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
