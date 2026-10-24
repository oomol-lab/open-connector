import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  jungleScoutActionHandlers,
  jungleScoutApiBaseUrl,
  jungleScoutHeaders,
  validateJungleScoutCredential,
} from "./runtime.ts";

const service = "junglescout";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: jungleScoutActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const keyName = credential.values.keyName?.trim();
    if (!keyName) throw new ProviderRequestError(400, "Jungle Scout API Key Name is missing");
    return { apiKey: credential.apiKey, keyName, fetcher, signal: context.signal };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: jungleScoutApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const keyName = credential.values.keyName?.trim();
    if (!keyName) throw new ProviderRequestError(400, "Jungle Scout API Key Name is missing");
    const defaults = jungleScoutHeaders(`${keyName}:${credential.apiKey}`);
    for (const [name, value] of Object.entries(defaults)) headers.set(name, value);
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input) {
    return Promise.resolve(validateJungleScoutCredential(input.apiKey, input.values.keyName ?? ""));
  },
};
