import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { HomeAssistantActionContext, HomeAssistantActionHandler } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  combineProviderActionHandlers,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { homeAssistantConfigActionHandlers } from "./runtime-config.ts";
import { homeAssistantWebSocketActionHandlers } from "./runtime-ws.ts";
import {
  homeAssistantActionHandlers,
  resolveHomeAssistantBaseUrl,
  validateHomeAssistantCredential,
} from "./runtime.ts";

const service = "home_assistant";

export const executors: ProviderExecutors = defineProviderExecutors<HomeAssistantActionContext>({
  service,
  handlers: combineProviderActionHandlers<"home_assistant", HomeAssistantActionHandler>(
    service,
    homeAssistantActionHandlers,
    homeAssistantConfigActionHandlers,
    homeAssistantWebSocketActionHandlers,
  ),
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

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveHomeAssistantBaseUrl({ values: credential.values, metadata: credential.metadata });
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    return validateHomeAssistantCredential(input);
  },
};
