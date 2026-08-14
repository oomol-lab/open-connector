import type { ProviderDefinition } from "../../core/types.ts";

import { stripeActions } from "./actions.ts";
import { stripeConnectOAuthScopes } from "./scopes.ts";

const service = "stripe";

/**
 * Stripe provider backed by Stripe secret or restricted API keys.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Stripe",
  categories: ["Finance", "Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://connect.stripe.com/oauth/authorize",
      tokenUrl: "https://connect.stripe.com/oauth/token",
      scopes: stripeConnectOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFields: {
        clientId: false,
      },
    },
    {
      type: "api_key",
      label: "Secret API Key",
      placeholder: "sk_test_...",
      description:
        "Stripe secret or restricted API key sent as a Bearer token. View and create keys in the Stripe Dashboard API keys page: https://dashboard.stripe.com/apikeys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://stripe.com",
  actions: stripeActions,
};
