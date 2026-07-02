import type { ProviderDefinition } from "../../core/types.ts";

import { sentryActions } from "./actions.ts";
import { sentryProviderScopes } from "./scopes.ts";

const service = "sentry";

/**
 * Sentry provider backed by the Sentry REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Sentry",
  categories: ["Developer Tools", "Security"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://sentry.io/oauth/authorize/",
      tokenUrl: "https://sentry.io/oauth/token/",
      scopes: [...sentryProviderScopes],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://sentry.io",
  actions: sentryActions,
};
