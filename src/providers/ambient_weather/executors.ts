import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError, requireApiKeyCredential } from "../provider-runtime.ts";
import { ambientWeatherActionHandlers, validateAmbientWeatherCredential } from "./runtime.ts";

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

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAmbientWeatherCredential(input, fetcher, signal);
  },
};
