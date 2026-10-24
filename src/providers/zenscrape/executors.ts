import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { validateZenscrapeCredential, zenscrapeActionHandlers, zenscrapeApiBaseUrl } from "./runtime.ts";

const service = "zenscrape";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zenscrapeActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: zenscrapeApiBaseUrl,
  auth: { type: "api_key_query", name: "apikey" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateZenscrapeCredential,
};
