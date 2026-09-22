import type { ProviderDefinition } from "../../core/types.ts";

import { cufinderActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "cufinder",
  displayName: "CUFinder",
  description: "Enrich company and person records with CUFinder.",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "CUFINDER_API_KEY",
      description:
        "CUFinder API key sent in the x-api-key header. Find it under Account > API key at https://dashboard.cufinder.io.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://cufinder.io",
  actions: cufinderActions,
};
