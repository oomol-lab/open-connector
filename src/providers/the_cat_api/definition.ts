import type { ProviderDefinition } from "../../core/types.ts";

import { theCatApiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "the_cat_api",
  displayName: "The Cat API",
  categories: ["Design & Media", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "THE_CAT_API_KEY",
      description:
        "The Cat API key sent with the x-api-key header. Create an account and copy your key from The Cat API dashboard: https://thecatapi.com/signup.",
    },
  ],
  homepageUrl: "https://thecatapi.com/",
  actions: theCatApiActions,
};
