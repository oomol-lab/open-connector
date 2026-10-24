import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { AllRatesTodayRuntimeContext } from "./runtime.ts";

import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { allratestodayActionHandlers, allratestodayApiBaseUrl, readAllRatesTodayError } from "./runtime.ts";

const service = "allratestoday";

export const executors: ProviderExecutors = defineProviderExecutors<AllRatesTodayRuntimeContext>({
  service,
  handlers: allratestodayActionHandlers,
  skipDnsValidation: true,
  createContext(context, fetcher): AllRatesTodayRuntimeContext {
    return { fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  readError: readAllRatesTodayError,
  service,
  baseUrl: allratestodayApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
});
