import type { ProviderDefinition } from "../../core/types.ts";

import { fluxguardActions } from "./actions.ts";

const service = "fluxguard";

/**
 * Fluxguard provider backed by the Fluxguard REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Fluxguard",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FLUXGUARD_API_KEY",
      description:
        "Fluxguard API key sent in the x-api-key header. Create it from your Fluxguard organization settings: https://app.fluxguard.com/settings?tab=org",
    },
  ],
  homepageUrl: "https://fluxguard.com/",
  actions: fluxguardActions,
};
