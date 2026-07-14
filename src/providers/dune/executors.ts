import type { ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";
import { duneActionHandlers } from "./runtime.ts";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("dune", duneActionHandlers, {
  skipDnsValidation: true,
});
