import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineApiKeyProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { workizActionHandlers, workizApiBaseUrl, validateWorkizCredential } from "./runtime.ts";

const service = "workiz";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, workizActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: workizApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, url }) {
    const credential = await requireApiKeyCredential(context, service);
    const segments = url.pathname.split("/");
    segments.splice(3, 0, encodeURIComponent(credential.apiKey));
    url.pathname = segments.join("/");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateWorkizCredential(input.apiKey, fetcher, signal);
  },
};
