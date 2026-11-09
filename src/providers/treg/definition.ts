import type { ProviderDefinition } from "../../core/types.ts";

import { tregActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "treg",
  displayName: "Treg",
  categories: ["Developer Tools", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      description: "Create a token in your team's API Keys tab at https://treg.to/app.",
      extraFields: [
        {
          key: "team",
          label: "Team slug",
          required: false,
          secret: false,
          inputType: "text",
          description: "Select a team when using a personal token. Omit this for a team API key.",
        },
      ],
    },
  ],
  homepageUrl: "https://treg.to",
  actions: tregActions,
};
