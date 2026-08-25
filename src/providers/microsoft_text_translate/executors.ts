import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  microsoftTextTranslateActionHandlers,
  microsoftTextTranslateApiBaseUrl,
  microsoftTextTranslateApiVersion,
  validateMicrosoftTextTranslateCredential,
} from "./runtime.ts";

const service = "microsoft_text_translate";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: microsoftTextTranslateActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      region: optionalString(credential.values.region ?? credential.metadata.region),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Azure Translator request failed",
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: microsoftTextTranslateApiBaseUrl,
  auth: { type: "api_key_header", name: "Ocp-Apim-Subscription-Key" },
  customizeRequest({ credential, headers, url }) {
    url.searchParams.set("api-version", microsoftTextTranslateApiVersion);
    if (credential?.authType === "api_key") {
      const region = optionalString(credential.values.region ?? credential.metadata.region);
      if (region) headers.set("Ocp-Apim-Subscription-Region", region);
    }
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const region = optionalString(input.values.region);
    await validateMicrosoftTextTranslateCredential({ apiKey: input.apiKey, region, fetcher, signal });
    return {
      profile: { displayName: region ? `Azure Translator (${region})` : "Azure Translator" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: microsoftTextTranslateApiBaseUrl,
        apiVersion: microsoftTextTranslateApiVersion,
        region,
        validationEndpoint: "/detect",
      },
    };
  },
};
