import type { ProviderDefinition } from "../../core/types.ts";

import { bitriseActions } from "./actions.ts";

const service = "bitrise";

export const provider: ProviderDefinition = {
  service,
  displayName: "Bitrise",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "bitrise_api_token",
      description:
        "Bitrise API token sent as the Authorization header. Create or view Personal Access Tokens and Workspace API tokens from Bitrise API settings at https://app.bitrise.io/me/profile#/security.",
    },
  ],
  homepageUrl: "https://bitrise.io",
  actions: bitriseActions,
};
