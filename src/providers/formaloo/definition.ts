import type { ProviderDefinition } from "../../core/types.ts";

import { formalooActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "formaloo",
  displayName: "Formaloo",
  categories: ["Data", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FORMALOO_API_KEY",
      description: "Formaloo API Key from your profile API Keys page.",
      extraFields: [
        {
          key: "apiSecret",
          label: "API Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "FORMALOO_API_SECRET",
          description: "Formaloo API Secret used to obtain short-lived authorization tokens.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.formaloo.com/",
  actions: formalooActions,
};
