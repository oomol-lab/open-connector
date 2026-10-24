import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AppStoreServerContext } from "./runtime-helpers.ts";

import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import { createAppStoreServerAuthorization, readAppStoreServerCredential } from "./jwt.ts";
import {
  appStoreServerActionHandlers,
  appStoreServerApiOrigins,
  readAppStoreServerEnvironment,
  validateAppStoreServerCredential,
} from "./runtime.ts";

const service = "app_store_server";

export const executors: ProviderExecutors = defineProviderExecutors<AppStoreServerContext>({
  service,
  handlers: appStoreServerActionHandlers,
  skipDnsValidation: true,
  fallbackMessage: "App Store Server API request failed",
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AppStoreServerContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      authorization: createAppStoreServerAuthorization(readAppStoreServerCredential(credential.values)),
      environment: readAppStoreServerEnvironment(credential.values.environment),
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    return validateAppStoreServerCredential(input.values, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, service);
    return appStoreServerApiOrigins[readAppStoreServerEnvironment(credential.values.environment)];
  },
  auth: { type: "none" },
  skipDnsValidation: true,
  allowedEndpoint: providerProxyEndpointPrefixes("/inApps/v1", "/inApps/v2"),
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    headers.set(
      "authorization",
      await createAppStoreServerAuthorization(readAppStoreServerCredential(credential.values))(),
    );
  },
});
