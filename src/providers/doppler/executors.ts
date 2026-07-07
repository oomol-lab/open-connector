import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { DopplerActionName } from "./actions.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { dopplerChangeRequestActionHandlers } from "./runtime.change-requests.ts";
import { dopplerIntegrationActionHandlers } from "./runtime.integrations.ts";
import { dopplerLogActionHandlers } from "./runtime.logs.ts";
import { dopplerProjectActionHandlers, validateDopplerCredential } from "./runtime.projects.ts";
import { dopplerSecretActionHandlers } from "./runtime.secrets.ts";
import { dopplerApiBaseUrl } from "./runtime.shared.ts";
import { dopplerTokenActionHandlers } from "./runtime.tokens.ts";

interface DopplerActionContext {
  accessToken: string;
  fetcher: ProviderFetch;
}

const service = "doppler";

const dopplerActionHandlers = {
  ...dopplerProjectActionHandlers,
  ...dopplerSecretActionHandlers,
  ...dopplerLogActionHandlers,
  ...dopplerTokenActionHandlers,
  ...dopplerIntegrationActionHandlers,
  ...dopplerChangeRequestActionHandlers,
} satisfies Record<
  DopplerActionName,
  (input: Record<string, unknown>, context: DopplerActionContext) => Promise<unknown>
>;

export const executors: ProviderExecutors = defineProviderExecutors<DopplerActionContext>({
  service,
  handlers: dopplerActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<DopplerActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      accessToken: credential.apiKey,
      fetcher: withDefaultSignal(fetcher, context.signal),
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dopplerApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDopplerCredential(input.apiKey, withDefaultSignal(fetcher, signal));
  },
};

function withDefaultSignal(fetcher: ProviderFetch, signal: AbortSignal | undefined): ProviderFetch {
  return ((url: URL | RequestInfo, init?: RequestInit) =>
    fetcher(url, {
      ...init,
      signal: init?.signal ?? signal,
    })) as ProviderFetch;
}
