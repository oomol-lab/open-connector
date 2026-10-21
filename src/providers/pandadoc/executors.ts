import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { defineProviderProxy } from "../provider-runtime.ts";
import { executors, pandadocApiBaseUrl, validatePandadocCredential } from "./runtime.ts";
import { pandadocDocumentEvent } from "./trigger-on-document-event.ts";

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

export const triggers: readonly IntegrationDefinition[] = [pandadocDocumentEvent];
