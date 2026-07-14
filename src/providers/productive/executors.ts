import type { CredentialValidators, ProviderProxyExecutor, ResolvedCredential } from "../../core/types.ts";

import { requiredString } from "../../core/cast.ts";
import { defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { executors, productiveApiBaseUrl, validateProductiveCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "productive",
  skipDnsValidation: true,
  baseUrl: productiveApiBaseUrl,
  auth: { type: "api_key_header", name: "x-auth-token" },
  customizeRequest({ headers, credential }) {
    const apiCredential = credential as Extract<ResolvedCredential, { authType: "api_key" }>;
    headers.set(
      "x-organization-id",
      requiredString(
        apiCredential.values.organizationId,
        "organizationId",
        (message) => new ProviderRequestError(400, message),
      ),
    );
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateProductiveCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
