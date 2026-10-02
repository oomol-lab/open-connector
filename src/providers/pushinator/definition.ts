import type { ProviderDefinition } from "../../core/types.ts";

import { pushinatorActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "pushinator",
  displayName: "Pushinator",
  homepageUrl: "https://pushinator.com",
  iconUrl: "https://pushinator.com/logo.svg",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Pushinator API key",
      description:
        "Create an API key at https://console.pushinator.com/tokens. Sent as a Bearer token. Connecting only checks that the key is non-empty; Pushinator verifies it when you run an action.",
    },
  ],
  actions: pushinatorActions,
};
