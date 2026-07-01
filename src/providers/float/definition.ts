import type { ProviderDefinition } from "../../core/types.ts";

import { floatActions } from "./actions.ts";

const service = "float";

/**
 * Float provider backed by the Float API v3.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Float",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "FLOAT_API_TOKEN",
      description:
        "Float bearer token used with the Authorization header. Create or view tokens in Float Account Settings Integrations: https://app.float.com/#/integrations/api",
    },
  ],
  homepageUrl: "https://www.float.com/",
  actions: floatActions,
};
