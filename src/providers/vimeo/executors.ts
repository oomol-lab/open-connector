import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors } from "../provider-runtime.ts";
import { validateVimeoCredential, vimeoActionHandlers } from "./runtime.ts";

const service = "vimeo";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, vimeoActionHandlers);

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateVimeoCredential(input.accessToken, fetcher, signal);
  },
};
