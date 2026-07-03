import type { ProviderDefinition } from "../../core/types.ts";

import { beeminderActions } from "./actions.ts";

const service = "beeminder";

export const provider: ProviderDefinition = {
  service,
  displayName: "Beeminder",
  categories: ["Productivity", "Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Auth Token",
      placeholder: "BEEMINDER_AUTH_TOKEN",
      description:
        "Beeminder personal auth token passed as auth_token. View or create it after signing in at https://www.beeminder.com/api/v1/auth_token.json.",
    },
  ],
  homepageUrl: "https://www.beeminder.com",
  actions: beeminderActions,
};
