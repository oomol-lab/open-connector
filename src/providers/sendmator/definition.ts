import type { ProviderDefinition } from "../../core/types.ts";

import { sendmatorActions } from "./actions.ts";

const service = "sendmator";

export const provider: ProviderDefinition = {
  service,
  displayName: "Sendmator",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk_live_...",
      description:
        "Sendmator API key sent in the X-API-Key header. Create or view API keys after signing in to the Sendmator app: https://app.sendmator.com.",
      extraFields: [
        {
          key: "teamId",
          label: "Team ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "team_...",
          description:
            "Optional Sendmator team ID sent in the X-Team-ID header when your account requires team-scoped contact writes.",
        },
      ],
    },
  ],
  homepageUrl: "https://sendmator.com",
  actions: sendmatorActions,
};
