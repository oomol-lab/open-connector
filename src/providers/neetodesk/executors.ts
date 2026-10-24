import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { NeetodeskContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import {
  neetodeskActionHandlers,
  neetodeskBaseUrl,
  normalizeNeetodeskSubdomain,
  validateNeetodeskCredential,
} from "./runtime.ts";

const service = "neetodesk";

export const executors: ProviderExecutors = defineProviderExecutors<NeetodeskContext>({
  service,
  handlers: neetodeskActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      subdomain: normalizeNeetodeskSubdomain(credential.values.subdomain),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return neetodeskBaseUrl(normalizeNeetodeskSubdomain(credential.values.subdomain));
  },
  auth: { type: "api_key_header", name: "X-Api-Key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateNeetodeskCredential(
      input.apiKey,
      input.values.subdomain,
      createProviderFetch({ fetch: fetcher }),
      signal,
    );
  },
};
