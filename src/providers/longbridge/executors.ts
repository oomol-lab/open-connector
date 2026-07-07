import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors } from "../provider-runtime.ts";
import { longbridgeActionHandlers, validateLongbridgeCredential } from "./runtime.ts";

const service = "longbridge";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, longbridgeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    return validateLongbridgeCredential(input.accessToken, fetcher, signal);
  },
};
