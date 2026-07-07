import type { ProviderDefinition } from "../../core/types.ts";

import { momentumIoActions } from "./actions.ts";

const service = "momentum_io";

export const provider: ProviderDefinition = {
  service,
  displayName: "Momentum.io",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MOMENTUM_API_KEY",
      description:
        "Momentum API key sent with the X-API-Key header. Enable API access and create keys from the Momentum dashboard Integrations page: https://docs.momentum.io/api-access.",
    },
  ],
  homepageUrl: "https://www.momentum.io",
  actions: momentumIoActions,
};
