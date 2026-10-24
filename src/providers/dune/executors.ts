import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { duneActionHandlers, duneApiBaseUrl } from "./runtime.ts";

const service = "dune";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, duneActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: duneApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Dune-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
