import type { ProviderDefinition } from "../../core/types.ts";

import { daffyActions } from "./actions.ts";

const service = "daffy";

export const provider: ProviderDefinition = {
  service,
  displayName: "Daffy",
  categories: ["Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DAFFY_API_KEY",
      description:
        "Daffy API key sent with the X-Api-Key header. Create or revoke API keys in the API subsection under your Daffy profile settings: https://www.daffy.org/settings/api",
    },
  ],
  homepageUrl: "https://www.daffy.org/",
  actions: daffyActions,
};
