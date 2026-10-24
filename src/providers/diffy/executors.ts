import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { diffyActionHandlers, diffyApiBaseUrl, exchangeDiffyApiKey, validateDiffyCredential } from "./runtime.ts";

const service = "diffy";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: diffyActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, fetcher, signal: context.signal };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: diffyApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, fetcher, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const token = await exchangeDiffyApiKey({ apiKey: credential.apiKey, fetcher, signal: context.signal });
    headers.set("authorization", `Bearer ${token}`);
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateDiffyCredential({ apiKey: input.apiKey, fetcher, signal });
  },
};
