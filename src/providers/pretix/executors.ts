import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import {
  createPretixContext,
  normalizePretixBaseUrl,
  pretixActionHandlers,
  validatePretixCredential,
} from "./runtime.ts";

const service = "pretix";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: pretixActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createPretixContext(credential.apiKey, credential.values.baseUrl, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    const value = optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl);
    if (!value) throw new ProviderRequestError(500, "pretix connection is missing baseUrl metadata");
    return normalizePretixBaseUrl(value);
  },
  auth: { type: "api_key_authorization", prefix: "Token " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validatePretixCredential(input.apiKey, input.values.baseUrl, guardedFetcher, signal);
  },
};
