import type { ProviderDefinition } from "../../core/types.ts";

import { dataForSeoActions } from "./actions.ts";

const service = "dataforseo";

export const provider: ProviderDefinition = {
  service,
  displayName: "DataForSEO",
  categories: ["Data", "Marketing"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "login",
          label: "API Login",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "DATAFORSEO_LOGIN",
          description:
            "DataForSEO API login used as the Basic Auth username. Find it in the API Access page after signing in: https://app.dataforseo.com/api-access.",
        },
        {
          key: "password",
          label: "API Password",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "DATAFORSEO_PASSWORD",
          description:
            "DataForSEO API password used as the Basic Auth password. Generate or view it in the API Access page after signing in: https://app.dataforseo.com/api-access.",
        },
      ],
    },
  ],
  homepageUrl: "https://dataforseo.com",
  actions: dataForSeoActions,
};
