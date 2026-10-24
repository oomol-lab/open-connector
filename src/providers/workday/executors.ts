import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { requireOAuthCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { validateWorkdayCredential, workdayActionHandlers } from "./runtime.ts";

const service = "workday";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: workdayActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireOAuthCredential(context, service);
    return {
      accessToken: credential.accessToken,
      metadata: credential.metadata,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "workday request failed",
});

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher, signal }) {
    return validateWorkdayCredential(input, fetcher, signal);
  },
};
