import type { ProviderDefinition } from "../../core/types.ts";

import { mauticActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "mautic",
  displayName: "Mautic",
  categories: ["Marketing"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          required: true,
          inputType: "text",
          secret: false,
          placeholder: "https://mautic.example.com",
        },
        { key: "username", label: "Username", required: true, inputType: "text", secret: false },
        { key: "password", label: "Password", required: true, inputType: "password", secret: true },
      ],
    },
  ],
  homepageUrl: "https://mautic.org",
  actions: mauticActions,
};
