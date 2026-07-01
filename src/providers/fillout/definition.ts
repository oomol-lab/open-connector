import type { ProviderDefinition } from "../../core/types.ts";

import { filloutActions } from "./actions.ts";

const service = "fillout";

/**
 * Fillout provider backed by the Fillout REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Fillout",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fillout_api_key",
      description:
        "Fillout API key used with the Authorization Bearer header. Create it from Account Settings > Developer settings in Fillout: https://build.fillout.com/settings/developer.",
    },
  ],
  homepageUrl: "https://www.fillout.com/",
  actions: filloutActions,
};
