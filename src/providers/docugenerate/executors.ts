import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { DocugenerateActionContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  docugenerateActionHandlers,
  resolveDocugenerateApiBaseUrl,
  resolveDocugenerateProxyBaseUrl,
  validateDocugenerateCredential,
} from "./runtime.ts";

const service = "docugenerate";

export const executors: ProviderExecutors = defineProviderExecutors<DocugenerateActionContext>({
  service,
  handlers: docugenerateActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DocugenerateActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const region = optionalString(credential.values.region) ?? optionalString(credential.metadata.region);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveDocugenerateApiBaseUrl(region),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDocugenerateCredential(input.apiKey, input.values, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: resolveDocugenerateProxyBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
});
