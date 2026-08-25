import type { ProviderDefinition } from "../../core/types.ts";

import { humaansActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "humaans",
  displayName: "Humaans",
  description: "Inspect a Humaans API token and read people records with filters and pagination.",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Access Token",
      placeholder: "HUMAANS_API_ACCESS_TOKEN",
      description:
        "Create or manage an API access token using the official instructions: https://docs.humaans.io/api/#authentication",
    },
  ],
  homepageUrl: "https://humaans.io",
  actions: humaansActions,
};
