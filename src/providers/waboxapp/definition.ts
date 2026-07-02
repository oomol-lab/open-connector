import type { ProviderDefinition } from "../../core/types.ts";

import { waboxappActions } from "./actions.ts";

const service = "waboxapp";

export const provider: ProviderDefinition = {
  service,
  displayName: "waboxapp",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "WABOXAPP_API_TOKEN",
      description:
        "Waboxapp API token used with the token parameter. Sign in to waboxapp and copy the API Token used to configure the waboxapp Chrome extension and REST API: https://www.waboxapp.com/login.",
      extraFields: [
        {
          key: "uid",
          label: "Account UID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "34666123456",
          description:
            "The connected WhatsApp account phone number with international code, matching the uid field shown in the official Waboxapp API status examples.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.waboxapp.com",
  actions: waboxappActions,
};
