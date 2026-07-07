import type { ProviderDefinition } from "../../core/types.ts";

import { codacyActions } from "./actions.ts";

const service = "codacy";

export const provider: ProviderDefinition = {
  service,
  displayName: "Codacy",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "CODACY_API_TOKEN",
      description:
        "Codacy account API token sent with the api-token header. Generate one in Codacy user settings under API Tokens: https://docs.codacy.com/codacy-api/api-tokens/#account-api-tokens.",
    },
  ],
  homepageUrl: "https://www.codacy.com",
  actions: codacyActions,
};
