import type { ProviderDefinition } from "../../core/types.ts";

import { basinActions } from "./actions.ts";

const service = "basin";

export const provider: ProviderDefinition = {
  service,
  displayName: "Basin",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "basin_api_key",
      description:
        "Basin account API key sent with the Authorization Token header. Find or regenerate it from the Basin API section in your dashboard: https://docs.usebasin.com/account-management/api-access/",
      extraFields: [],
    },
  ],
  homepageUrl: "https://usebasin.com",
  actions: basinActions,
};
