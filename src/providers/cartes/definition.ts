import type { ProviderDefinition } from "../../core/types.ts";

import { cartesActions } from "./actions.ts";

const service = "cartes";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cartes.io",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "CARTES_IO_API_TOKEN",
      description:
        "Cartes.io API token sent in the Authorization header. Create or view API tokens from the Cartes.io account API token page: https://app.cartes.io/account/api-token",
    },
  ],
  homepageUrl: "https://cartes.io",
  actions: cartesActions,
};
