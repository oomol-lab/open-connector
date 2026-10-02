import type { ProviderDefinition } from "../../core/types.ts";

import { nationalizeActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "nationalize",
  displayName: "Nationalize",
  homepageUrl: "https://nationalize.io/",
  iconUrl: "https://nationalize.io/favicon.ico",
  categories: ["Data & Analytics"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "NATIONALIZE_API_KEY",
      description:
        "Get your Nationalize API key from the account dashboard at https://nationalize.io/login (register at https://nationalize.io/register). Connecting validates the key with one sample name lookup, consuming one name from your quota.",
    },
  ],
  actions: nationalizeActions,
};
