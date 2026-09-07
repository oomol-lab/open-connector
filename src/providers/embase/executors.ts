import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import {
  createEmbaseActionContext,
  embaseActionHandlers,
  embaseApiBaseUrl,
  validateEmbaseCredential,
} from "./runtime.ts";
const service = "embase";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: embaseActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType != "api_key")
      throw new ProviderRequestError(401, "Configure Embase credentials.");
    return createEmbaseActionContext({ apiKey: credential.apiKey, ...credential.values }, fetcher);
  },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateEmbaseCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: embaseApiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "x-els-apikey", source: { type: "api_key" } },
      { name: "x-els-insttoken", source: { type: "credential_value", name: "institutionToken" }, optional: true },
    ],
  },
  customizeRequest({ credential, headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!credential || credential.authType !== "api_key") return;
    const institutionToken = credential.values.institutionToken?.trim();
    if (institutionToken) headers.set("x-els-insttoken", institutionToken);
    else headers.delete("x-els-insttoken");
  },
  skipDnsValidation: true,
});
