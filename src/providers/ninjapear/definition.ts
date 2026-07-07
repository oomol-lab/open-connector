import type { ProviderDefinition } from "../../core/types.ts";

import { ninjapearActions } from "./actions.ts";

const service = "ninjapear";

export const provider: ProviderDefinition = {
  service,
  displayName: "NinjaPear",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "NINJAPEAR_API_KEY",
      description:
        "NinjaPear API key used with the Authorization Bearer header. Get it from the API section in the NinjaPear dashboard: https://nubela.co/dashboard.",
    },
  ],
  homepageUrl: "https://nubela.co/",
  actions: ninjapearActions,
};
