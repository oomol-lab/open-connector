import type { ProviderDefinition } from "../../core/types.ts";

import { getresponseActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "getresponse",
  displayName: "GetResponse",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "GETRESPONSE_API_KEY",
      extraFields: [
        {
          key: "maxApiBaseUrl",
          label: "MAX API Base URL",
          required: false,
          inputType: "text",
          secret: false,
          placeholder: "https://api3.getresponse360.com/v3",
        },
        {
          key: "domain",
          label: "MAX Domain",
          required: false,
          inputType: "text",
          secret: false,
          placeholder: "example.com",
        },
        {
          key: "parentLogin",
          label: "Parent Account Login",
          required: false,
          inputType: "text",
          secret: false,
          placeholder: "parent@example.com",
        },
      ],
    },
  ],
  homepageUrl: "https://www.getresponse.com",
  actions: getresponseActions,
};
