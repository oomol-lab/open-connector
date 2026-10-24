import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  getWaiverForeverUserInfo,
  waiverforeverActionHandlers,
  waiverforeverApiBaseUrl,
  waiverforeverUserInfoPath,
} from "./runtime.ts";

const service = "waiverforever";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, waiverforeverActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: waiverforeverApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const userInfo = await getWaiverForeverUserInfo(input.apiKey, fetcher, signal, "validate");
    return {
      profile: { displayName: userInfo.username ?? "WaiverForever API Key" },
      grantedScopes: [],
      metadata: {
        username: userInfo.username,
        apiBaseUrl: waiverforeverApiBaseUrl,
        validationEndpoint: waiverforeverUserInfoPath,
      },
    };
  },
};
