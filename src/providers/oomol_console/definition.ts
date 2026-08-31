import type { ProviderDefinition } from "../../core/types.ts";

import { oomolConsoleActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "oomol_console",
  displayName: "OOMOL Console",
  description: "Inspect OOMOL teams, billing, usage, members, and connector execution history.",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "OOMOL API Key",
      placeholder: "OOMOL_API_KEY",
      description: "OOMOL API key used as a Bearer token for Console APIs.",
      extraFields: [
        {
          key: "teamId",
          label: "Default Team ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "team-id",
          description:
            "Optional OOMOL team ID used by team-scoped actions. You can discover accessible teams with list_teams.",
        },
      ],
    },
  ],
  homepageUrl: "https://console.oomol.com",
  actions: oomolConsoleActions,
};
