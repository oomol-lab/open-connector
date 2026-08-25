import type { ProviderDefinition } from "../../core/types.ts";

import { teamupActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "teamup",
  displayName: "Teamup Calendar",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "TEAMUP_API_KEY",
      description:
        "Teamup API key sent in the Teamup-Token header. Request a free key at https://teamup.com/api-keys/request.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.teamup.com/",
  actions: teamupActions,
};
