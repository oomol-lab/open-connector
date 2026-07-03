import type { ProviderDefinition } from "../../core/types.ts";

import { betterStackActions } from "./actions.ts";

const service = "better_stack";

export const provider: ProviderDefinition = {
  service,
  displayName: "Better Stack",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "bst_...",
      description:
        "Better Stack API token used with the Authorization Bearer header. Create it from Better Stack > API tokens: https://betterstack.com/docs/errors/api/getting-api-token/.",
    },
  ],
  homepageUrl: "https://betterstack.com",
  actions: betterStackActions,
};
