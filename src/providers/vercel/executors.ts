import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { VercelActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { readVercelTeamScope, validateVercelCredential, vercelActionHandlers, vercelApiBaseUrl } from "./runtime.ts";

const service = "vercel";
const vercelProxyUserAgent = "oomol-connector/1.0 (+https://oomol.com)";

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

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: vercelApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("user-agent", vercelProxyUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateVercelCredential(input, fetcher);
  },
};
