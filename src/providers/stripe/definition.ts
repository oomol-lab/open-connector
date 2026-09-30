import type { ProviderDefinition } from "../../core/types.ts";

import { stripeActions } from "./actions.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "stripe";

/**
 * Stripe provider backed by Stripe secret or restricted API keys.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Stripe",
  categories: ["Finance", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
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
  triggers: [triggerSnapshot0_0],
  triggerPermissions,
};
