import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors, defineProviderProxy, requireBearerCredential } from "../provider-runtime.ts";
import { tiktokBusinessActionHandlers, validateTikTokBusinessCredential } from "./runtime.ts";

const service = "tiktok_business";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, tiktokBusinessActionHandlers);

export const credentialValidators: CredentialValidators = {
  oauth2(input, { fetcher }): ReturnType<typeof validateTikTokBusinessCredential> {
    return validateTikTokBusinessCredential(
      {
        accessToken: input.accessToken,
        metadata: input.metadata,
      },
      fetcher,
    );
  },

  apiKey(input, { fetcher }): ReturnType<typeof validateTikTokBusinessCredential> {
    return validateTikTokBusinessCredential(
      {
        accessToken: input.apiKey,
        metadata: {},
      },
      fetcher,
    );
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://business-api.tiktok.com",
  auth: { type: "none" },
  async customizeRequest({ context, service, headers }) {
    const credential = await requireBearerCredential(context, service);
    headers.set("Access-Token", credential.accessToken);
  },
});
