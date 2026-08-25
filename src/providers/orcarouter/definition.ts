import type { ProviderDefinition } from "../../core/types.ts";

import { orcarouterActions } from "./actions.ts";

const service = "orcarouter";

/**
 * OrcaRouter provider backed by OrcaRouter API keys.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "OrcaRouter",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk-orca-...",
      description:
        "OrcaRouter API key used with the Authorization Bearer header. Get it from https://www.orcarouter.ai/console.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.orcarouter.ai",
  actions: orcarouterActions,
};
