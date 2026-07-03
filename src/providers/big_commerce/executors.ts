import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { BigCommerceContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { bigCommerceActionHandlers, normalizeBigCommerceStoreHash, validateBigCommerceCredential } from "./runtime.ts";

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

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBigCommerceCredential(input, fetcher, signal);
  },
};
