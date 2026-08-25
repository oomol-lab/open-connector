import type { ProviderDefinition } from "../../core/types.ts";

import { jibbleActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "jibble",
  displayName: "Jibble",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "JIBBLE_PERSONAL_ACCESS_TOKEN",
      description:
        "Jibble personal access token sent as a Bearer token. Generate one under Organization Settings > API Keys: https://www.jibble.io/help/using-jibbles-api-for-your-custom-needs.",
    },
  ],
  homepageUrl: "https://www.jibble.io",
  actions: jibbleActions,
};
