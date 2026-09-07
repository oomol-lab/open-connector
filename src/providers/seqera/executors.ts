import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { defineSeqeraExecutors, normalizeSeqeraApiBaseUrl, validateSeqeraCredential } from "./runtime.ts";

export const executors: ProviderExecutors = defineSeqeraExecutors();

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "seqera",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "seqera");
    return normalizeSeqeraApiBaseUrl(
      typeof credential.metadata.apiBaseUrl === "string"
        ? credential.metadata.apiBaseUrl
        : credential.values.apiBaseUrl,
      "apiBaseUrl",
    );
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSeqeraCredential(
      input,
      createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed }),
      signal,
    );
  },
};
