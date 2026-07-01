import type { ProviderDefinition } from "../../core/types.ts";

import { agentqlActions } from "./actions.ts";

const service = "agentql";

export const provider: ProviderDefinition = {
  service,
  displayName: "AgentQL",
  categories: ["AI", "Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "AGENTQL_API_KEY",
      description: "AgentQL API key used with the X-API-Key header. Get it from the AgentQL developer dashboard.",
    },
  ],
  homepageUrl: "https://www.agentql.com",
  actions: agentqlActions,
};
