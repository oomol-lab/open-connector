import type { ProviderDefinition } from "../../core/types.ts";

import { codaActions } from "./actions.ts";

const service = "coda";

export const provider: ProviderDefinition = {
  service,
  displayName: "Coda",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "coda_api_token",
      description:
        "Coda API token used with the Authorization Bearer header. Generate it from your Coda account page at https://coda.io/account.",
    },
  ],
  homepageUrl: "https://coda.io",
  actions: codaActions,
};
