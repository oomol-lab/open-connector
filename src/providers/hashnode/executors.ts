import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { fetchHashnodeCurrentUser, hashnodeActionHandlers, hashnodeApiUrl } from "./runtime.ts";

const service = "hashnode";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hashnodeActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: hashnodeApiUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await fetchHashnodeCurrentUser(input.apiKey, fetcher, "validate", signal);
    const id = requiredProviderString(user.id, "Hashnode user ID");
    const username = requiredProviderString(user.username, "Hashnode username");
    const name = requiredProviderString(user.name, "Hashnode user name");
    const email = requiredProviderString(user.email, "Hashnode user email");

    return {
      profile: {
        accountId: id,
        displayName: `${name} (@${username})`,
        grantedScopes: [],
      },
      metadata: {
        apiBaseUrl: hashnodeApiUrl,
        userId: id,
        username,
        email,
      },
    };
  },
};

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(502, message));
}
