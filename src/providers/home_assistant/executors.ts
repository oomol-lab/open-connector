import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { HomeAssistantActionContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  homeAssistantActionHandlers,
  resolveHomeAssistantBaseUrl,
  validateHomeAssistantCredential,
} from "./runtime.ts";

const service = "home_assistant";

export const executors: ProviderExecutors = defineProviderExecutors<HomeAssistantActionContext>({
  service,
  handlers: homeAssistantActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HomeAssistantActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveHomeAssistantBaseUrl({
        values: credential.values,
        metadata: credential.metadata,
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    return validateHomeAssistantCredential(input);
  },
};
