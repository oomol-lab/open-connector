import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { defineBearerProviderExecutors } from "../provider-runtime.ts";
import { supabaseActionHandlers, validateSupabaseCredential, validateSupabaseOAuthCredential } from "./runtime.ts";

const service = "supabase";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, supabaseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSupabaseCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateSupabaseOAuthCredential(input.accessToken, fetcher, signal);
  },
};
