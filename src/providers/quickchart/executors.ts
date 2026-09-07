import type { ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { quickchartBaseUrl } from "./runtime.ts";

export { executors } from "./runtime.ts";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "quickchart",
  baseUrl: quickchartBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
});
