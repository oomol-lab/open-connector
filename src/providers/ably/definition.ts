import type { ProviderDefinition } from "../../core/types.ts";

import { ablyActions } from "./actions.ts";

const service = "ably";

/**
 * Ably provider backed by the public Ably REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Ably",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "appId.keyId:keySecret",
      description:
        "Ably API key used with HTTP Basic authentication. Create or view app API keys in the Ably dashboard under App settings > API keys: https://ably.com/dashboard.",
    },
  ],
  homepageUrl: "https://ably.com",
  actions: ablyActions,
};
