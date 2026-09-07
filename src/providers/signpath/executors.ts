import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderProxy, requireApiKeyCredential, requiredInputString } from "../provider-runtime.ts";
import { executors, signpathApiBaseUrl, validateSignpathCredential } from "./runtime.ts";

export { executors };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "signpath",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "signpath");
    const organizationId = requiredInputString(
      credential.values.organizationId ?? optionalString(credential.metadata.organizationId),
      "organizationId",
    );
    return `${signpathApiBaseUrl}/${encodeURIComponent(organizationId.trim())}`;
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }): ReturnType<typeof validateSignpathCredential> {
    return validateSignpathCredential({ ...input.values, apiKey: input.apiKey }, fetcher);
  },
};
