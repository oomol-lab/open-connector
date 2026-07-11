import type { ProviderDefinition } from "../../core/types.ts";

import { revenueCatActions } from "./actions.ts";

const service = "revenuecat";

export const provider: ProviderDefinition = {
  service,
  displayName: "RevenueCat",
  description: "Manage RevenueCat projects, customers, subscriptions, entitlements, offerings, products, and metrics.",
  categories: ["Finance", "Developer Tools", "Subscriptions"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "V2 Secret API Key",
      placeholder: "sk_...",
      description:
        "RevenueCat REST API v2 secret API key sent as a Bearer token. Create a V2 secret key in the RevenueCat project settings API keys page: https://www.revenuecat.com/docs/welcome/authentication.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.revenuecat.com",
  actions: revenueCatActions,
};
