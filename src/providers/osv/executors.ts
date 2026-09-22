import type { ProviderExecutors } from "../../core/types.ts";
import type { OsvRuntimeContext } from "./runtime.ts";

import { defineProviderExecutors } from "../provider-runtime.ts";
import { osvActionHandlers } from "./runtime.ts";

const service = "osv";

export const executors: ProviderExecutors = defineProviderExecutors<OsvRuntimeContext>({
  service,
  handlers: osvActionHandlers,
  skipDnsValidation: true,
  createContext(context, fetcher): OsvRuntimeContext {
    return { fetcher, signal: context.signal };
  },
});
