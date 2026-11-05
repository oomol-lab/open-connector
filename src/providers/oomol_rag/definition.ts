import type { ProviderDefinition } from "../../core/types.ts";

import { oomolRagActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "oomol_rag",
  displayName: "OOMOL RAG",
  description: "Create and edit knowledge articles, and publish saved revisions to an OOMOL team's knowledge base.",
  categories: ["Productivity", "Developer Tools"],
  homepageUrl: "https://knowledge-base.oomol.com",
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "OOMOL API Key",
      placeholder: "OOMOL_API_KEY",
      description: "OOMOL API key with access to the selected team's knowledge base, sent as a Bearer token.",
      extraFields: [
        {
          key: "teamId",
          label: "Team ID",
          inputType: "text",
          required: true,
          secret: false,
          description:
            "The OOMOL team ID (not its display name). All article operations use this connection's team scope.",
        },
      ],
    },
  ],
  actions: oomolRagActions,
};
