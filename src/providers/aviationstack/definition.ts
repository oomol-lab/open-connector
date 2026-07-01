import type { ProviderDefinition } from "../../core/types.ts";

import { aviationstackActions } from "./actions.ts";

const service = "aviationstack";

export const provider: ProviderDefinition = {
  service,
  displayName: "Aviationstack",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "AVIATIONSTACK_API_KEY",
      description:
        "Aviationstack API key sent with the access_key query parameter. Find it in your APILayer dashboard: https://apilayer.com/docs/article/managing-api-keys",
      extraFields: [],
    },
  ],
  homepageUrl: "https://aviationstack.com/",
  actions: aviationstackActions,
};
