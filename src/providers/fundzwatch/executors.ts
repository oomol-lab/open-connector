import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { createFundzwatchContext, fundzwatchActionHandlers, validateFundzwatchCredential } from "./runtime.ts";

const service = "fundzwatch";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: fundzwatchActionHandlers,
  createContext: createFundzwatchContext,
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = { apiKey: validateFundzwatchCredential };

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.fundz.net",
  auth: { type: "bearer" },
  skipDnsValidation: true,
});
