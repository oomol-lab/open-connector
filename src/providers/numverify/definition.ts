import type { ProviderDefinition } from "../../core/types.ts";

import { numverifyActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "numverify",
  displayName: "Numverify",
  description: "International phone number validation and dialing information",
  homepageUrl: "https://numverify.com",
  categories: ["Data & Analytics", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Access Key",
      placeholder: "NUMVERIFY_ACCESS_KEY",
      description:
        "Get your Numverify API access key from https://numverify.com/dashboard. Requests use HTTPS; your plan must allow HTTPS access.",
    },
  ],
  actions: numverifyActions,
};
