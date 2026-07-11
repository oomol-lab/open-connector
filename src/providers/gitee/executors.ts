import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineBearerProviderExecutors } from "../provider-runtime.ts";
import { giteeActionHandlers, parseGiteeScopes, validateGiteeCredential } from "./runtime.ts";

const service = "gitee";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, giteeActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateGiteeCredential(input.apiKey, fetcher, signal);
  },
  oauth2(input, { fetcher, signal }) {
    return validateGiteeCredential(input.accessToken, fetcher, signal, parseGiteeScopes(input.metadata.scope));
  },
};
