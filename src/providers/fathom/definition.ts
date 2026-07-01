import type { ProviderDefinition } from "../../core/types.ts";

import { fathomActions } from "./actions.ts";

const service = "fathom";

/**
 * Fathom Analytics provider backed by the public Fathom API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Fathom Analytics",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "FATHOM_API_TOKEN",
      description:
        "Fathom Analytics API token used with the Authorization: Bearer <token> header. Create one from Settings > API at https://app.usefathom.com/api.",
    },
  ],
  homepageUrl: "https://usefathom.com",
  actions: fathomActions,
};
