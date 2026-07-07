import type { ProviderDefinition } from "../../core/types.ts";

import { ablyControlActions } from "./actions.ts";

const service = "ably_control";

/**
 * Ably Control provider backed by the Ably Control API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Ably Control",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "ABLY_CONTROL_ACCESS_TOKEN",
      description:
        "Ably Control API access token used as a Bearer token. Create or view Control API access tokens in the Ably account dashboard: https://ably.com/users/access_tokens.",
    },
  ],
  homepageUrl: "https://ably.com",
  actions: ablyControlActions,
};
