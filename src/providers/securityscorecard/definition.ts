import type { ProviderDefinition } from "../../core/types.ts";

import { securityscorecardActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "securityscorecard",
  displayName: "SecurityScorecard",
  description: "Company cybersecurity ratings and third-party risk monitoring",
  homepageUrl: "https://securityscorecard.com/",
  categories: ["Security & Identity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "SECURITYSCORECARD_API_TOKEN",
      description:
        "Generate an API token in My Settings > API: https://platform.securityscorecard.io/#/settings/api . Requires a paid plan with API access. Sent as Authorization: Token <token>.",
    },
  ],
  actions: securityscorecardActions,
};
