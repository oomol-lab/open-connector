import type { CredentialValidators, ExecutionContext, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executors, resolveQuadernoApiBaseUrl, validateQuadernoCredential } from "./runtime.ts";

export { executors };

const service = "quaderno";

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateQuadernoCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: quadernoProxyBaseUrl,
  auth: { type: "api_key_basic", suffix: ":x" },
});

async function quadernoProxyBaseUrl(context: ExecutionContext): Promise<string> {
  const credential = await requireApiKeyCredential(context, service);
  return resolveQuadernoApiBaseUrl(credential.metadata);
}
