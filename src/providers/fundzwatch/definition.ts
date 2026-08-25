import type { ProviderDefinition } from "../../core/types.ts";

import { fundzwatchActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "fundzwatch",
  displayName: "FundzWatch",
  categories: ["Data", "Sales", "Marketing"],
  authTypes: ["no_auth", "api_key"],
  auth: [
    { type: "no_auth" },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fundz_test_...",
      description:
        "FundzWatch API key sent as a Bearer token. Get a free developer key at https://fundzwatch.ai/onboarding.",
    },
  ],
  homepageUrl: "https://fundzwatch.ai/",
  actions: fundzwatchActions,
};
