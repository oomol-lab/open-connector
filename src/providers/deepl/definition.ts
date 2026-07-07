import type { ProviderDefinition } from "../../core/types.ts";

import { deeplActions } from "./actions.ts";

const service = "deepl";

export const provider: ProviderDefinition = {
  service,
  displayName: "DeepL",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DEEPL_API_KEY",
      description:
        "DeepL API key sent with the DeepL-Auth-Key authorization scheme. Find and manage it in the API Keys & Limits tab of your DeepL API account: https://developers.deepl.com/docs/getting-started/managing-api-keys.",
    },
  ],
  homepageUrl: "https://www.deepl.com",
  actions: deeplActions,
};
