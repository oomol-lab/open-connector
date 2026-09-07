import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { HoneybadgerActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { honeybadgerActionHandlers, resolveHoneybadgerApiBaseUrl, validateHoneybadgerCredential } from "./runtime.ts";

const service = "honeybadger";

export const executors: ProviderExecutors = defineProviderExecutors<HoneybadgerActionContext>({
  service,
  handlers: honeybadgerActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HoneybadgerActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveHoneybadgerApiBaseUrl({
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
    return resolveHoneybadgerApiBaseUrl({ metadata: credential.metadata });
  },
  allowedOrigins: ["https://api.honeybadger.io", "https://eu-api.honeybadger.io"],
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, options) {
    return validateHoneybadgerCredential(input, options);
  },
};
