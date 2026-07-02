import type { ProviderDefinition } from "../../core/types.ts";

import { calendlyActions, calendlyProviderScopes } from "./actions.ts";

const service = "calendly";

/**
 * Calendly provider backed by the Calendly API v2.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Calendly",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://calendly.com/oauth/authorize",
      tokenUrl: "https://calendly.com/oauth/token",
      scopes: calendlyProviderScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "cal_live_pat",
      description:
        "Calendly personal access token used with the Authorization Bearer header. Create it from API & Webhooks in the Calendly Integrations page: https://calendly.com/integrations/api_webhooks",
    },
  ],
  homepageUrl: "https://calendly.com",
  actions: calendlyActions,
};
