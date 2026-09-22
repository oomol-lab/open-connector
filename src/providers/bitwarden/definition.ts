import type { ProviderDefinition } from "../../core/types.ts";

import { bitwardenActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "bitwarden",
  displayName: "Bitwarden",
  description: "Read Bitwarden organization members, groups, collections, events, policies, and subscription data.",
  categories: ["Security", "Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "clientId",
          label: "Organization Client ID",
          required: true,
          secret: false,
          inputType: "text",
          placeholder: "organization.CLIENT_ID",
          description:
            "The client ID from the organization's Bitwarden API key. View it under Settings > Organization info: https://bitwarden.com/help/public-api/#authentication.",
        },
        {
          key: "clientSecret",
          label: "Organization Client Secret",
          required: true,
          secret: true,
          inputType: "password",
          placeholder: "CLIENT_SECRET",
          description:
            "The client secret paired with the organization API key. View or rotate it under Settings > Organization info: https://bitwarden.com/help/public-api/#authentication.",
        },
        {
          key: "region",
          label: "Region",
          required: true,
          secret: false,
          inputType: "text",
          placeholder: "us",
          description: "The Bitwarden cloud region: us or eu.",
        },
      ],
    },
  ],
  homepageUrl: "https://bitwarden.com/",
  actions: bitwardenActions,
};
