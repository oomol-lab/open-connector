import type { ProviderDefinition } from "../../core/types.ts";

import { openseoMcpActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "openseo_mcp",
  displayName: "OpenSEO MCP",
  description: "Research keywords, track search rankings, and review site audits and reports",
  homepageUrl: "https://openseo.so",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API key",
      placeholder: "oseo_...",
      description:
        "At https://app.openseo.so, select the workspace you want to connect, then create a key under Settings > API keys and paste it here. This connection uses your access to that workspace.",
      extraFields: [],
    },
  ],
  actions: openseoMcpActions,
};
