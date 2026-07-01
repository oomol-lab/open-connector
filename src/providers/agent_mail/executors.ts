import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { agentMailActionHandlers, validateAgentMailCredential } from "./runtime.ts";

const service = "agent_mail";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: agentMailActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAgentMailCredential(input.apiKey, fetcher, signal);
  },
};
