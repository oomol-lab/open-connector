import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors } from "../provider-runtime.ts";
import { linearMcpActionHandlers, validateLinearMcpCredential } from "./runtime-mcp.ts";

const service = "linear_mcp";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, linearMcpActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  oauth2: validateLinearMcpCredential,
};
