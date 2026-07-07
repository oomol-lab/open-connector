import type { ProviderDefinition } from "../../core/types.ts";

import { repairshoprActions } from "./actions.ts";

const service = "repairshopr";

export const provider: ProviderDefinition = {
  service,
  displayName: "RepairShopr",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "REPAIRSHOPR_API_TOKEN",
      description:
        "RepairShopr API token used to authorize API requests. Create or view API tokens under More > Admin > API: https://repair.uservoice.com/knowledgebase/articles/376312-repairshopr-rest-api-build-custom-extensions-app.",
      extraFields: [
        {
          key: "subdomain",
          label: "Subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "acme",
          description:
            "Your RepairShopr account subdomain from https://{subdomain}.repairshopr.com. You can enter either the subdomain or the full account URL.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.repairshopr.com",
  actions: repairshoprActions,
};
