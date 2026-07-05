import type { ProviderDefinition } from "../../core/types.ts";

import { crispActions } from "./actions.ts";

const service = "crisp";

export const provider: ProviderDefinition = {
  service,
  displayName: "Crisp",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Token Key",
      placeholder: "CRISP_TOKEN_KEY",
      description:
        "Crisp token key used as the Basic Auth password. For website tokens, generate the key in Crisp Dashboard > Settings > Workspace Settings > Advanced configuration > API Token: https://app.crisp.chat/",
      extraFields: [
        {
          key: "tokenIdentifier",
          label: "Token Identifier",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "CRISP_TOKEN_ID",
          description:
            "Crisp token identifier used as the Basic Auth username. Copy it with the token key from Crisp Dashboard > Settings > Workspace Settings > Advanced configuration > API Token: https://app.crisp.chat/",
        },
        {
          key: "websiteId",
          label: "Website ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "8c842203-7ed8-4e29-a608-7cf78a7d2fcc",
          description:
            "Crisp website identifier used in REST API paths. Find it in Crisp Dashboard > Settings > Workspace Settings > Setup Instructions: https://app.crisp.chat/",
        },
        {
          key: "tokenTier",
          label: "Token Tier",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "website",
          description:
            "Crisp REST API token tier sent with X-Crisp-Tier. Use website for Dashboard website tokens or plugin for Marketplace plugin tokens.",
        },
      ],
    },
  ],
  homepageUrl: "https://crisp.chat/",
  actions: crispActions,
};
