import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { HighLevelContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  highLevelActionHandlers,
  highLevelApiBaseUrl,
  highLevelApiVersion,
  readHighLevelLocationId,
  validateHighLevelCredential,
} from "./runtime.ts";

const service = "high_level";

export const executors: ProviderExecutors = defineProviderExecutors<HighLevelContext>({
  service,
  handlers: highLevelActionHandlers,
  async createContext(context, fetcher): Promise<HighLevelContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      locationId: readHighLevelLocationId(credential.values.locationId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: highLevelApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("version", highLevelApiVersion);
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateHighLevelCredential(input.apiKey, readHighLevelLocationId(input.values.locationId), fetcher, signal);
  },
};
