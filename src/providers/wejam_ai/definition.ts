import type { ProviderDefinition } from "../../core/types.ts";

import { wejamAiActions } from "./actions.ts";

const service = "wejam_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Jam",
  categories: ["AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "JAM_API_KEY",
      description:
        "Jam organization API key sent with the X-API-KEY header. Organization owners can create API keys from the Jam API keys page: https://auth.wejam.ai/org/api_keys/.",
    },
  ],
  homepageUrl: "https://wejam.ai",
  actions: wejamAiActions,
};
