import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ChatApiForWhatsappContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  chatApiForWhatsappActionHandlers,
  requireChatApiForWhatsappInstanceId,
  resolveChatApiForWhatsappBaseUrl,
  validateChatApiForWhatsappCredential,
} from "./runtime.ts";

const service = "chat_api_for_whatsapp";

export const executors: ProviderExecutors = defineProviderExecutors<ChatApiForWhatsappContext>({
  service,
  handlers: chatApiForWhatsappActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ChatApiForWhatsappContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      instanceId: requireChatApiForWhatsappInstanceId(credential.values.instanceId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveChatApiForWhatsappBaseUrl(credential.values.instanceId);
  },
  auth: {
    type: "api_key_query",
    name: "token",
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateChatApiForWhatsappCredential(
      {
        apiKey: input.apiKey,
        instanceId: input.values.instanceId,
      },
      fetcher,
      signal,
    );
  },
};
