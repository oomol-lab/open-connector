import type { ProviderDefinition } from "../../core/types.ts";

import { finageActions } from "./actions.ts";

const service = "finage";

/**
 * Finage provider backed by the Finage market data REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Finage",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FINAGE_API_KEY",
      description:
        "Finage API key passed as the apikey query parameter. Register or manage your key in the Finage Moon dashboard: https://moon.finage.co.uk/register.",
    },
  ],
  homepageUrl: "https://finage.co.uk",
  actions: finageActions,
};
