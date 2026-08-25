import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { createSeaTableContext, seatableActionHandlers, validateSeaTableCredential } from "./runtime.ts";

const service = "seatable";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: seatableActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createSeaTableContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateSeaTableCredential(input.values, input.apiKey, guardedFetcher, signal);
  },
};
