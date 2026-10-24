import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createEvervaultContext, evervaultActionHandlers, evervaultApiBaseUrl, validateEvervault } from "./runtime.ts";
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "evervault",
  handlers: evervaultActionHandlers,
  createContext: createEvervaultContext,
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "evervault",
  baseUrl: evervaultApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  customizeRequest({ headers, credential }) {
    if (credential?.authType !== "api_key") return;
    const appId = credential.values.appId;
    if (appId) {
      headers.set("authorization", `Basic ${Buffer.from(`${appId}:${credential.apiKey}`).toString("base64")}`);
    }
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateEvervault(input, fetcher, signal);
  },
};
import { Buffer } from "node:buffer";
