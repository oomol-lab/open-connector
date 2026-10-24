import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { WhatsAppActionContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  validateWhatsAppCredential,
  whatsappActionHandlers,
  whatsappGraphApiBaseUrl,
  whatsappGraphApiVersion,
} from "./runtime.ts";

const service = "whatsapp";

export const executors: ProviderExecutors = defineProviderExecutors<WhatsAppActionContext>({
  service,
  handlers: whatsappActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<WhatsAppActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: WhatsAppActionContext = {
      accessToken: credential.apiKey,
      wabaId: optionalString(credential.values.wabaId) ?? optionalString(credential.metadata.wabaId),
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) providerContext.transitFiles = context.transitFiles;
    return providerContext;
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: `${whatsappGraphApiBaseUrl}/${whatsappGraphApiVersion}`,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWhatsAppCredential(input, fetcher, signal);
  },
};
