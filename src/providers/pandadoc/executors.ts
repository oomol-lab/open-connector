import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, pandadocApiBaseUrl, validatePandadocCredential } from "./runtime.ts";

export { executors };

const service = "pandadoc";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: pandadocApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "API-Key ",
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validatePandadocCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
