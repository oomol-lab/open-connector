import type { ProviderDefinition } from "../../core/types.ts";

import { supabaseActions, supabaseProviderScopes } from "./actions.ts";

const service = "supabase";

/**
 * Supabase provider backed by the Supabase Management API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Supabase",
  categories: ["Developer Tools", "Data", "Storage"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.supabase.com/v1/oauth/authorize",
      tokenUrl: "https://api.supabase.com/v1/oauth/token",
      scopes: [...supabaseProviderScopes],
      tokenEndpointAuthMethod: "client_secret_basic",
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "sbp_...",
      description:
        "Supabase personal access token used with the Authorization Bearer header. Create it in the Supabase dashboard: https://supabase.com/dashboard/account/tokens.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://supabase.com",
  actions: supabaseActions,
};
