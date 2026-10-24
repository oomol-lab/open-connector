import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  lingvanexTranslationApiActionHandlers,
  lingvanexTranslationApiBaseUrl,
  validateLingvanexTranslationApiCredential,
} from "./runtime.ts";

const service = "lingvanex_translation_api";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  lingvanexTranslationApiActionHandlers,
);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateLingvanexTranslationApiCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lingvanexTranslationApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
