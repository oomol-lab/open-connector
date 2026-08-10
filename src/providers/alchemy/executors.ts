import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerProxyEndpointPrefixes,
} from "../provider-runtime.ts";
import { alchemyActionHandlers, validateAlchemyCredential } from "./runtime.ts";

const service = "alchemy";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, alchemyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAlchemyCredential(input.apiKey, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://eth-mainnet.g.alchemy.com",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint: providerProxyEndpointPrefixes("/v2", "/nft/v3"),
});
