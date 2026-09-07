import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { HoneycombActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { honeycombActionHandlers, resolveHoneycombApiBaseUrl, validateHoneycombCredential } from "./runtime.ts";

const service = "honeycomb";

export const executors: ProviderExecutors = defineProviderExecutors<HoneycombActionContext>({
  service,
  handlers: honeycombActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HoneycombActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveHoneycombApiBaseUrl({
        values: credential.values,
        metadata: credential.metadata,
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context): Promise<string> {
    const credential = await requireApiKeyCredential(context, service);
    return resolveHoneycombApiBaseUrl({ metadata: credential.metadata });
  },
  allowedOrigins: ["https://api.honeycomb.io", "https://api.eu1.honeycomb.io"],
  auth: { type: "api_key_header", name: "X-Honeycomb-Team" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    return validateHoneycombCredential(input, options);
  },
};
