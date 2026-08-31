import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AerisWeatherContext } from "./runtime.ts";

import { requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { aerisweatherActionHandlers, aerisweatherApiBaseUrl, validateAerisWeatherCredential } from "./runtime.ts";

const service = "aerisweather";

export const executors: ProviderExecutors = defineProviderExecutors<AerisWeatherContext>({
  service,
  handlers: aerisweatherActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AerisWeatherContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      clientId: requiredString(credential.values.clientId, "clientId", providerInputError),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: aerisweatherApiBaseUrl,
  auth: { type: "api_key_query", name: "client_secret" },
  customizeRequest({ credential, url }) {
    const clientId =
      credential && credential.authType === "api_key"
        ? requiredString(credential.values.clientId, "clientId", providerInputError)
        : undefined;
    if (!clientId) {
      throw new ProviderRequestError(401, "Configure aerisweather API key credentials first.");
    }
    url.searchParams.set("client_id", clientId);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateAerisWeatherCredential(
      {
        apiKey: input.apiKey,
        clientId: input.values.clientId,
      },
      fetcher,
      signal,
    );
  },
};
