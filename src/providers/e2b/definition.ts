import type { ProviderDefinition } from "../../core/types.ts";

import { e2bActions } from "./actions.ts";

const service = "e2b";

/**
 * E2B provider backed by the public sandbox management API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "E2B",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "E2B_API_KEY",
      description:
        "E2B API key used with the X-API-Key header. Create or view keys in the E2B dashboard: https://e2b.dev/dashboard?tab=keys.",
    },
  ],
  homepageUrl: "https://e2b.dev",
  actions: e2bActions,
};
