import type { ProviderDefinition } from "../../core/types.ts";

import { deutschlandgptActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "deutschlandgpt",
  displayName: "DeutschlandGPT",
  description: "Use DeutschlandGPT models, chat completions, and embeddings.",
  categories: ["AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DEUTSCHLANDGPT_API_KEY",
      description:
        "DeutschlandGPT Platform API key used as a Bearer token. Manage keys at https://dialog.deutschlandgpt.de/platform-api.",
    },
  ],
  homepageUrl: "https://www.deutschlandgpt.de/",
  actions: deutschlandgptActions,
};
