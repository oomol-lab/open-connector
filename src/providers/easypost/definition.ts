import type { ProviderDefinition } from "../../core/types.ts";

import { easypostActions } from "./actions.ts";

const service = "easypost";

/**
 * EasyPost provider backed by the public shipping API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "EasyPost",
  categories: ["Productivity", "Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "EASYPOST_API_KEY",
      description:
        "EasyPost API key used as the Basic authentication username. Create or manage keys in EasyPost account settings: https://app.easypost.com/account/settings?tab=api-keys",
    },
  ],
  homepageUrl: "https://www.easypost.com/",
  actions: easypostActions,
};
