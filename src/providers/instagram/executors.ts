import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors } from "../provider-executors.ts";
import { instagramActionHandlers, validateInstagramCredential } from "./runtime.ts";

export { oauth } from "./oauth.ts";

const service = "instagram";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, instagramActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  oauth2(credential, { fetcher, signal }) {
    return validateInstagramCredential(credential, fetcher, signal);
  },
};
