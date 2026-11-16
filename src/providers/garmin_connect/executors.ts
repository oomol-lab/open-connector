import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  garminConnectActionHandlers,
  garminConnectApiBaseUrl,
  getGarminConnectAccessToken,
  invalidateGarminConnectAccessToken,
  readGarminConnectError,
  validateGarminConnectApiKey,
} from "./runtime.ts";

const service = "garmin_connect";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, garminConnectActionHandlers, {
  skipDnsValidation: true,
});

// readError receives no request context, so capture the token sent in a per-call closure.
export const proxy: ProviderProxyExecutor = (input, context) => {
  let sentToken: { apiKey: string; value: string } | undefined;
  return defineProviderProxy({
    service,
    baseUrl: garminConnectApiBaseUrl,
    skipDnsValidation: true,
    auth: {
      type: "bearer_resolver",
      async resolve({ context, fetcher, signal }) {
        const credential = await requireApiKeyCredential(context, service);
        const token = await getGarminConnectAccessToken({ apiKey: credential.apiKey, fetcher, signal });
        sentToken = { apiKey: credential.apiKey, value: token.value };
        return { accessToken: token.value, tokenType: "Bearer" };
      },
    },
    async readError(response) {
      if (response.status === 401 && sentToken)
        await invalidateGarminConnectAccessToken(sentToken.apiKey, sentToken.value);
      return readGarminConnectError(response);
    },
  })(input, context);
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGarminConnectApiKey(input.apiKey, fetcher, signal);
  },
};
