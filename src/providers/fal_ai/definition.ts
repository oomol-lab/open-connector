import type { ProviderDefinition } from "../../core/types.ts";

import { falAiActions } from "./actions.ts";

const service = "fal_ai";

/**
 * fal.ai provider backed by the public fal platform and queue APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "fal.ai",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FAL_KEY",
      description:
        "fal.ai API key sent with the Authorization: Key header. Create or view keys in the fal dashboard: https://fal.ai/dashboard/keys.",
    },
  ],
  homepageUrl: "https://fal.ai",
  actions: falAiActions,
};
