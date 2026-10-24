import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { readWpMapsCredential, validateWpMapsCredential, wpMapsActionHandlers, wpMapsApiBaseUrl } from "./runtime.ts";

const service = "wp_maps";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: wpMapsActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return { credential: readWpMapsCredential(credential.apiKey, credential.values), fetcher };
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateWpMapsCredential(input.apiKey, input.values, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: wpMapsApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  customizeRequest({ credential, url }) {
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure wp_maps API key credentials first.");
    }
    const values = readWpMapsCredential(credential.apiKey, credential.values);
    url.searchParams.set("access_token", values.accessToken);
    url.searchParams.set("client_id", values.clientId);
  },
});
