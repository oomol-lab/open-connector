import type { ProviderDefinition } from "../../core/types.ts";

import { seatableActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "seatable",
  displayName: "SeaTable",
  description: "Read and manage rows in a SeaTable base.",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Base API Token",
      placeholder: "SeaTable base API token",
      description:
        "A read-write API token for one SeaTable base. Create it from the base menu under Advanced > API Tokens: https://seatable.com/help/create-api-tokens/",
      extraFields: [
        {
          key: "serverUrl",
          label: "Server URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://cloud.seatable.io",
          description:
            "The HTTPS URL of SeaTable Cloud or your self-hosted SeaTable server. Public addresses work by default; private-network instances require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK in the self-hosted runtime. Reserved, local, and cloud-metadata targets remain blocked.",
        },
      ],
    },
  ],
  homepageUrl: "https://seatable.com",
  actions: seatableActions,
};
