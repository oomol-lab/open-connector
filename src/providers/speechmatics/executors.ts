import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { SpeechmaticsActionContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { speechmaticsBatchHosts } from "./constants.ts";
import { speechmaticsActionHandlers, validateSpeechmaticsCredential } from "./runtime.ts";

const service = "speechmatics";
const speechmaticsBatchApiBaseUrls = Object.values(speechmaticsBatchHosts).map((host) => `https://${host}/v2`);

export const executors: ProviderExecutors = defineProviderExecutors<SpeechmaticsActionContext>({
  service,
  handlers: speechmaticsActionHandlers,
  async createContext(input, fetcher) {
    const credential = await requireApiKeyCredential(input, service);
    return {
      apiKey: credential.apiKey,
      defaultRegion:
        optionalString(credential.values.defaultRegion) ?? optionalString(credential.metadata.defaultRegion),
      fetcher,
      signal: input.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    const apiBaseUrl = optionalString(credential.metadata.apiBaseUrl);
    if (!apiBaseUrl || !speechmaticsBatchApiBaseUrls.includes(apiBaseUrl)) {
      throw new ProviderRequestError(400, "speechmatics proxy requires a supported batch apiBaseUrl");
    }
    return apiBaseUrl;
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSpeechmaticsCredential(
      { apiKey: input.apiKey, defaultRegion: optionalString(input.values.defaultRegion) },
      fetcher,
      signal,
    );
  },
};
