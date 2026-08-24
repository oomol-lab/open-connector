import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineSlackProviderExecutors, slackActionHandlers, slackCredentialValidators } from "./runtime.ts";

const service = "slack";

export const executors: ProviderExecutors = defineSlackProviderExecutors(service, "user", slackActionHandlers);

export const credentialValidators: CredentialValidators = slackCredentialValidators;
