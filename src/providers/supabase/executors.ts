import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  supabaseActionHandlers,
  supabaseApiBaseUrl,
  validateSupabaseCredential,
  validateSupabaseOAuthCredential,
} from "./runtime.ts";

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
    return validateSupabaseOAuthCredential(input.accessToken, fetcher, signal);
  },
};
