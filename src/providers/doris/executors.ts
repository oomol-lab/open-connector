import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { createDorisContext, dorisActionHandlers, requestDoris } from "./runtime.ts";

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "doris",
  handlers: dorisActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, "doris");
    return createDorisContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    const context = createDorisContext(input.values, guardedFetcher, signal);
    await requestDoris("SELECT 1 AS ok", context.defaultDatabase ?? "information_schema", 1, context, true);
    return {
      profile: {
        accountId: `${context.baseUrl}:${context.username}`,
        displayName: `${context.username}@${new URL(context.baseUrl).host}`,
      },
    };
  },
};
