import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import {
  createOnlyofficeContext,
  normalizePortalUrl,
  onlyofficeActionHandlers,
  validateOnlyofficeCredential,
} from "./runtime.ts";

const service = "onlyoffice_docspace";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: onlyofficeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createOnlyofficeContext(credential.apiKey, credential.values, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    const portal = optionalString(credential.metadata.portalUrl) ?? optionalString(credential.values.portalUrl);
    if (!portal) throw new ProviderRequestError(500, "ONLYOFFICE connection is missing portalUrl");
    return `${normalizePortalUrl(portal)}/api/2.0`;
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guarded = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateOnlyofficeCredential(input.apiKey, input.values, guarded, signal);
  },
};
