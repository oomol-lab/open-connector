import type { ProviderDefinition } from "../../core/types.ts";

import { frontActions } from "./actions.ts";

const service = "front";

/**
 * Front provider backed by the public Core API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Front",
  categories: ["Communication", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "Bearer token",
      description:
        "Front Core API token sent as a Bearer token. Create or view tokens in Settings > Developers > API Tokens, or see https://dev.frontapp.com/docs/create-and-revoke-api-tokens.",
    },
  ],
  homepageUrl: "https://front.com",
  actions: frontActions,
};
