import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { VercelActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { readVercelTeamScope, validateVercelCredential, vercelActionHandlers } from "./runtime.ts";

const service = "vercel";

export const executors: ProviderExecutors = defineProviderExecutors<VercelActionContext>({
  service,
  handlers: vercelActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<VercelActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      ...readVercelTeamScope(credential.values),
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateVercelCredential(input, fetcher);
  },
};
