import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { CrtshRuntimeContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { readCrtshError } from "./runtime.ts";
import { crtshActionHandlers, crtshApiBaseUrl } from "./runtime.ts";

const service = "crtsh";

export const executors: ProviderExecutors = defineProviderExecutors<CrtshRuntimeContext>({
  service,
  handlers: crtshActionHandlers,
  skipDnsValidation: true,
  createContext(context, fetcher): CrtshRuntimeContext {
    return { fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  readError: readCrtshError,
  service,
  baseUrl: crtshApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
});
