import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors } from "../provider-executors.ts";
import { closedloopAiActionHandlers, validateClosedloopAiCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineOAuthProviderExecutors("closedloop_ai", closedloopAiActionHandlers);
export const credentialValidators: CredentialValidators = { oauth2: validateClosedloopAiCredential };
