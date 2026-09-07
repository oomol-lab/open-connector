import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { TruveraActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  createTruveraContext,
  resolveTruveraApiBaseUrl,
  truveraActionHandlers,
  validateTruveraCredential,
} from "./runtime.ts";

const service = "truvera";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveTruveraApiBaseUrl(credential.values.apiBaseUrl ?? credential.metadata.apiBaseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineProviderExecutors<TruveraActionContext>({
  service,
  handlers: truveraActionHandlers,
  createContext: createTruveraContext,
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTruveraCredential,
};
