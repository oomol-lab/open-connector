import type { ProviderExecutors } from "../../core/types.ts";
import type { AppleDbActionContext } from "./runtime.ts";

import { defineProviderExecutors } from "../provider-runtime.ts";
import { appledbActionHandlers } from "./runtime.ts";

const service = "appledb";

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
