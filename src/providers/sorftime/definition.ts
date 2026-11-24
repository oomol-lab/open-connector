import type { ProviderDefinition } from "../../core/types.ts";

import { sorftimeActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "sorftime",
  displayName: "Sorftime",
  description:
    "Sorftime through its API: typed operations for Amazon and Walmart keywords, rankings, sales history and categories.",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Account-SK",
      placeholder: "SORFTIME_ACCOUNT_SK",
      description: "Sorftime Account-SK used by the API and CLI. Copy it at https://seller.sorftime.com/api.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.sorftime.com/",
  actions: sorftimeActions,
};
