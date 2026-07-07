import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { unifapiApiBaseUrl, unifapiApiVersion, unifapiActionHandlers, validateUnifapiCredential } from "./runtime.ts";

const service = "unifapi";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, unifapiActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: unifapiApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("unifapi-version", unifapiApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateUnifapiCredential,
};
