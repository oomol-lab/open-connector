import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  garminConnectActionHandlers,
  garminConnectApiBaseUrl,
  getGarminConnectAccessToken,
  readGarminConnectError,
  validateGarminConnectApiKey,
} from "./runtime.ts";

const service = "garmin_connect";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, garminConnectActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: garminConnectApiBaseUrl,
  skipDnsValidation: true,
  auth: {
    type: "bearer_resolver",
    async resolve({ context, fetcher, signal }) {
      const credential = await requireApiKeyCredential(context, service);
      const token = await getGarminConnectAccessToken({ apiKey: credential.apiKey, fetcher, signal });
      return { accessToken: token.value, tokenType: "Bearer" };
    },
  },
  readError: readGarminConnectError,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGarminConnectApiKey(input.apiKey, fetcher, signal);
  },
};
