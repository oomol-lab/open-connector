import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { validateWecomBotCredential, wecomBotActionHandlers } from "./runtime.ts";

const service = "wecom_bot";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: wecomBotActionHandlers,
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
  apiKey(input, { fetcher, signal }) {
    return validateWecomBotCredential(input.apiKey, fetcher, signal);
  },
};
