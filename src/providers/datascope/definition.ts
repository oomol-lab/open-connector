import type { ProviderDefinition } from "../../core/types.ts";

import { datascopeActions } from "./actions.ts";

const service = "datascope";

export const provider: ProviderDefinition = {
  service,
  displayName: "DataScope",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DATASCOPE_API_KEY",
      description:
        "DataScope API key sent with the Authorization header. Find it in the DataScope API setup guide: https://help.mydatascope.com/en/articles/9628405-datascope-api",
    },
  ],
  homepageUrl: "https://www.mydatascope.com",
  actions: datascopeActions,
};
