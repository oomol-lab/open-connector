import type { ProviderDefinition } from "../../core/types.ts";

import { dadataRuActions } from "./actions.ts";

const service = "dadata_ru";

export const provider: ProviderDefinition = {
  service,
  displayName: "DaData.ru",
  categories: ["Data", "Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DADATA_API_KEY",
      description:
        "DaData API key used in the Authorization header with the Token prefix. Create or view it in your DaData profile at https://dadata.ru/profile/#info.",
    },
  ],
  homepageUrl: "https://dadata.ru",
  actions: dadataRuActions,
};
