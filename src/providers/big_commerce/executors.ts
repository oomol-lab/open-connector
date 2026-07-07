import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BigCommerceContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  bigCommerceActionHandlers,
  buildBigCommerceApiBaseUrl,
  normalizeBigCommerceStoreHash,
  validateBigCommerceCredential,
} from "./runtime.ts";

const service = "big_commerce";

export const executors: ProviderExecutors = defineProviderExecutors<BigCommerceContext>({
  service,
  handlers: bigCommerceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BigCommerceContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      storeHash: normalizeBigCommerceStoreHash(
        optionalString(credential.values.storeHash) ?? optionalString(credential.metadata.storeHash),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const storeHash = normalizeBigCommerceStoreHash(
      optionalString(credential.values.storeHash) ?? optionalString(credential.metadata.storeHash),
    );
    return buildBigCommerceApiBaseUrl(storeHash);
  },
  auth: { type: "api_key_header", name: "x-auth-token" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBigCommerceCredential(input, fetcher, signal);
  },
};
