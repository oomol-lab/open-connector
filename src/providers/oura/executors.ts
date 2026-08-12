import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  defineBearerProviderExecutors,
  defineProviderProxy,
  providerProxyEndpointPrefixes,
} from "../provider-runtime.ts";
import { ouraApiBaseUrl } from "./collections.ts";
import { fetchOuraAccountProfile, ouraActionHandlers, parseOuraGrantedScopes } from "./runtime.ts";

const service = "oura";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, ouraActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ouraApiBaseUrl,
  auth: { type: "bearer" },
  // Webhook subscription endpoints authenticate with the OAuth application's
  // client id/secret rather than the connected user credential.
  allowedEndpoint: providerProxyEndpointPrefixes("/v2/usercollection"),
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return fetchOuraAccountProfile(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    const result = await fetchOuraAccountProfile(input.accessToken, fetcher, signal);
    return {
      ...result,
      grantedScopes: parseOuraGrantedScopes(input.metadata.scope),
    };
  },
};
