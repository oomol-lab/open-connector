import type { ProviderDefinition } from "../../core/types.ts";

import { neonActions } from "./actions.ts";

const service = "neon";

/**
 * Neon provider backed by the public Neon API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Neon",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "napi_...",
      description:
        "Neon API key used with the Authorization Bearer header. Create it in Account settings > API keys in the Neon Console: https://neon.com/docs/manage/api-keys.",
    },
  ],
  homepageUrl: "https://neon.com",
  actions: neonActions,
};
