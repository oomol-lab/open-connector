import type { ProviderDefinition } from "../../core/types.ts";

import { zlibraryActions } from "./actions.ts";

const service = "zlibrary";

export const provider: ProviderDefinition = {
  service,
  displayName: "Z-Library",
  categories: ["Books", "Reference"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "email",
          label: "Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@example.com",
          description:
            "The Z-Library account email used to log in to the EAPI. Login happens lazily, on the first action that needs it.",
        },
        {
          key: "password",
          label: "Password",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "••••••••••••",
          description: "The Z-Library account password. Stored as a secret and sent only to the selected EAPI domain.",
        },
        {
          key: "eapiDomain",
          label: "EAPI Domain (optional)",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "z-library.ec",
          description:
            "Pin a specific EAPI domain instead of probing the built-in fallback list. Useful when the default domains are behind the DiamWall anti-bot wall.",
        },
      ],
    },
  ],
  homepageUrl: "https://z-lib.org",
  actions: zlibraryActions,
};
