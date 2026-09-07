import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { KaleidoActionContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { kaleidoActionHandlers, normalizeKaleidoBaseUrl, validateKaleidoCredential } from "./runtime.ts";

const service = "kaleido";

export const executors: ProviderExecutors = defineProviderExecutors<KaleidoActionContext>({
  service,
  handlers: kaleidoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KaleidoActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl) ?? "",
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeKaleidoBaseUrl(optionalString(credential.metadata.baseUrl));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKaleidoCredential({
      apiKey: input.apiKey,
      baseUrl: optionalString(input.values.baseUrl),
      fetcher,
      signal,
    });
  },
};
