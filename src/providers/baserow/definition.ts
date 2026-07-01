import type { ProviderDefinition } from "../../core/types.ts";

import { baserowActions } from "./actions.ts";

const service = "baserow";

export const provider: ProviderDefinition = {
  service,
  displayName: "Baserow",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Database Token",
      placeholder: "baserow_database_token",
      description:
        "Baserow database token used with the Authorization Token header. Create it in Workspace settings > Database tokens: https://baserow.io/user-docs/personal-api-tokens.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://baserow.io",
  actions: baserowActions,
};
