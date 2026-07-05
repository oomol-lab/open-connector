import type { ProviderDefinition } from "../../core/types.ts";

import { docsbotAiActions } from "./actions.ts";

const service = "docsbot_ai";

/**
 * DocsBot AI provider backed by the public API-key REST APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "DocsBot AI",
  categories: ["AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DOCSBOT_API_KEY",
      description:
        "DocsBot AI user API key sent as a Bearer token. Create or change it from the API Keys section of your DocsBot dashboard: https://docsbot.ai/app/api",
    },
  ],
  homepageUrl: "https://docsbot.ai",
  actions: docsbotAiActions,
};
