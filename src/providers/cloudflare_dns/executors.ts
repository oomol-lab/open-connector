import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { compactObject } from "../../core/cast.ts";
import { cloudflareCurrentUserDisplayName } from "../cloudflare-current-user.ts";
import { defineBearerProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { cloudflareDnsActionHandlers, requestCloudflareCurrentUser, validateCloudflareDnsToken } from "./runtime.ts";

const service = "cloudflare_dns";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, cloudflareDnsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudflareDnsToken(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const user = await requestCloudflareCurrentUser(input.accessToken, fetcher, signal);
    const displayName = cloudflareCurrentUserDisplayName(user, "Cloudflare DNS");
    return {
      profile: {
        accountId: user.userId,
        displayName,
      },
      grantedScopes: input.profile.grantedScopes,
      metadata: compactObject({
        userId: user.userId,
        email: user.email,
        validationEndpoint: "/user",
      }),
    };
  },
};

export function createCloudflareDnsCredentialError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
