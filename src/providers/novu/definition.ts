import type { ProviderDefinition } from "../../core/types.ts";

import { novuActions } from "./actions.ts";

const service = "novu";

export const novuDefaultApiBaseUrl = "https://api.novu.co";

export const provider: ProviderDefinition = {
  service,
  displayName: "Novu",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret Key",
      placeholder: "NOVU_SECRET_KEY",
      description:
        "Novu environment secret key used with the Authorization: ApiKey header. Find it in the Novu Dashboard under Developer > API Keys: https://docs.novu.co/api-reference/authentication.",
      extraFields: [
        {
          key: "apiBaseUrl",
          label: "API Base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: novuDefaultApiBaseUrl,
          description:
            "Optional Novu Cloud API origin for your account region. Use https://api.novu.co for US or https://eu.api.novu.co for EU.",
        },
      ],
    },
  ],
  homepageUrl: "https://novu.co",
  actions: novuActions,
};
