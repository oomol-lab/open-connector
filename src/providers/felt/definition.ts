import type { ProviderDefinition } from "../../core/types.ts";

import { feltActions } from "./actions.ts";

const service = "felt";

export const provider: ProviderDefinition = {
  service,
  displayName: "Felt",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "felt_pat_...",
      description:
        "Felt API token sent as a Bearer token. Create or view tokens in the Developers tab of Felt Workspace Settings: https://felt.com/maps/latest/developers",
    },
  ],
  homepageUrl: "https://felt.com/",
  actions: feltActions,
};
