import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { bigpictureIoActionHandlers, validateBigpictureIoCredential } from "./runtime.ts";

const service = "bigpicture_io";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, bigpictureIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBigpictureIoCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://company.bigpicture.io",
  auth: { type: "api_key_authorization", prefix: "" },
});
