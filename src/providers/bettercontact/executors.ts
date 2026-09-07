import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BettercontactContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { bettercontactActionHandlers, validateBettercontactCredential } from "./runtime.ts";

const service = "bettercontact";
const bettercontactApiBaseUrl = "https://app.bettercontact.rocks/api/v2";

export const executors: ProviderExecutors = defineProviderExecutors<BettercontactContext>({
  service,
  handlers: bettercontactActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BettercontactContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      accountEmail: optionalString(credential.values.accountEmail) ?? optionalString(credential.metadata.accountEmail),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: bettercontactApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBettercontactCredential(input, fetcher, signal);
  },
};
