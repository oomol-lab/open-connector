import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { tripleWhaleActionHandlers, validateTripleWhaleCredential } from "./runtime.ts";

const service = "triple_whale";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, tripleWhaleActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateTripleWhaleCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.triplewhale.com/api/v2/",
  auth: { type: "api_key_header", name: "x-api-key" },
});
