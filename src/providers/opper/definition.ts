import type { ProviderDefinition } from "../../core/types.ts";

import { opperActions } from "./actions.ts";

/** Opper's EU-hosted, OpenAI-compatible AI gateway. */
export const provider: ProviderDefinition = {
  service: "opper",
  displayName: "Opper",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "op-...",
      description:
        "Create an API key at https://platform.opper.ai. Requests use Bearer authentication; inference requires account credit.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://opper.ai",
  actions: opperActions,
};
