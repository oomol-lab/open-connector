import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { KubernetesContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { createCustomCaFetch } from "../../core/custom-ca-fetch.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import {
  createKubernetesContext,
  kubernetesActionHandlers,
  normalizeKubernetesBaseUrl,
  normalizeKubernetesCertificateAuthority,
  readKubernetesError,
  validateKubernetesCredential,
} from "./runtime.ts";

const service = "kubernetes";

export const executors: ProviderExecutors = defineProviderExecutors<KubernetesContext>({
  service,
  handlers: kubernetesActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KubernetesContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createKubernetesContext(credential.values, credential.apiKey, fetcher, context.signal);
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeKubernetesBaseUrl(optionalString(credential.metadata.apiBaseUrl) ?? credential.values.baseUrl);
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowedEndpoint: providerProxyEndpointPrefixes("/api", "/apis"),
  readError: (response) => readKubernetesError(response),
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async transport(context) {
    const credential = await requireApiKeyCredential(context, service);
    const certificateAuthority = normalizeKubernetesCertificateAuthority(credential.values.certificateAuthorityData);
    return certificateAuthority ? createCustomCaFetch(certificateAuthority) : undefined;
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateKubernetesCredential(input.values, input.apiKey, fetcher, signal);
  },
};
