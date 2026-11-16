import type { ProviderDefinition } from "../../core/types.ts";

import { intervalsIcuActions } from "./actions.ts";

const service = "intervals_icu";

/**
 * Intervals.icu provider backed by its public REST API and a personal API key,
 * which reads the data of the athlete who created the key.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Intervals.icu",
  description:
    "Read your own Intervals.icu training data: activities with their intervals and streams, daily wellness with fitness and fatigue, the training calendar and your sport settings.",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "INTERVALS_ICU_API_KEY",
      description:
        "An Intervals.icu API key. Generate one in Developer Settings near the bottom of the Intervals.icu settings page (https://intervals.icu/settings). It gives access to the data of the athlete who created it until it is cleared or regenerated.",
    },
  ],
  homepageUrl: "https://intervals.icu",
  actions: intervalsIcuActions,
};
