import type { ProviderDefinition } from "../../core/types.ts";

import { eraserActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "eraser",
  displayName: "Eraser",
  categories: ["Design & Media", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "ERASER_API_TOKEN",
      description:
        "Eraser team API token sent as a bearer token. Generate it in team settings: https://app.eraser.io/dashboard/all?settings=api-tokens.",
    },
  ],
  homepageUrl: "https://www.eraser.io",
  actions: eraserActions,
};
