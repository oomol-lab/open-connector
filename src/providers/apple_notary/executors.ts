import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ExecutionContext } from "../../core/types.ts";

import { createAppStoreConnectAuthorization } from "../app_store_connect/jwt.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import { appleNotaryHandlers, appleNotaryApiOrigin, validateAppleNotaryCredential } from "./runtime.ts";

const service = "apple_notary";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: appleNotaryHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return { authorization: createAppStoreConnectAuthorization(credential.values), fetcher, signal: context.signal };
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, context) {
    return validateAppleNotaryCredential(input.values, context.fetcher, context.signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: appleNotaryApiOrigin,
  auth: { type: "none" },
  skipDnsValidation: true,
  allowedEndpoint: providerProxyEndpointPrefixes("/notary/v2"),
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    headers.set("authorization", await createAppStoreConnectAuthorization(credential.values)());
  },
});
