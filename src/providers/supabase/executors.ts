import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { supabaseActionHandlers, supabaseApiBaseUrl, validateSupabaseCredential } from "./runtime.ts";

const service = "supabase";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: supabaseApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, supabaseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSupabaseCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateSupabaseCredential(input.accessToken, fetcher, signal);
  },
};
