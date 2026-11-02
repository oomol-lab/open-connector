import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineOAuthProviderExecutors } from "../provider-executors.ts";
import { openalexMcpActionHandlers, validateOpenalexMcpCredential } from "./runtime-mcp.ts";

const service = "openalex_mcp";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, openalexMcpActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  oauth2: validateOpenalexMcpCredential,
};
