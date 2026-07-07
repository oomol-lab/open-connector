import type { ProviderDefinition } from "../../core/types.ts";

import { cockroachLabsActions } from "./actions.ts";

const service = "cockroach_labs";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cockroach Labs",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ccdb_live_...",
      description:
        "CockroachDB Cloud API key used with the Authorization Bearer header. Create or manage service account API keys in the CockroachDB Cloud console: https://www.cockroachlabs.com/docs/cockroachcloud/managing-access.",
    },
  ],
  homepageUrl: "https://www.cockroachlabs.com",
  actions: cockroachLabsActions,
};
