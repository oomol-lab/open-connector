import type { ProviderDefinition } from "../../core/types.ts";

import { agifyActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "agify",
  displayName: "Agify",
  description: "Estimate age from names, individually or in batches",
  categories: ["Data & Analytics"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "AGIFY_API_KEY",
      description:
        "Get your API key from your account dashboard at https://agify.io/login. Connecting performs one name lookup and consumes one unit of quota.",
    },
  ],
  homepageUrl: "https://agify.io/",
  actions: agifyActions,
};
