import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { ambientWeatherActionHandlers, ambientWeatherApiBaseUrl, validateAmbientWeatherCredential } from "./runtime.ts";

const service = "ambient_weather";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: ambientWeatherActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const applicationKey = optionalString(credential.values.applicationKey);
    if (!applicationKey) {
      throw new ProviderRequestError(400, "applicationKey is required");
    }

    return {
      apiKey: credential.apiKey,
      applicationKey,
      defaultDeviceMacAddress: optionalString(credential.metadata.defaultDeviceMacAddress),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ambientWeatherApiBaseUrl,
  auth: { type: "api_key_query", name: "apiKey" },
  skipDnsValidation: true,
  customizeRequest({ credential, headers, url }) {
    if (credential?.authType !== "api_key") throw new ProviderRequestError(400, "api_key credential is required");
    const applicationKey = optionalString(credential?.values.applicationKey);
    if (!applicationKey) throw new ProviderRequestError(400, "applicationKey is required");
    url.searchParams.set("applicationKey", applicationKey);
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmbientWeatherCredential(input, fetcher, signal);
  },
};
