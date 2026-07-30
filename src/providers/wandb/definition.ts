import type { ProviderDefinition } from "../../core/types.ts";

import { wandbActions } from "./actions.ts";

const service = "wandb";

/** Weights & Biases provider backed by the official W&B MCP server. */
export const provider: ProviderDefinition = {
  service,
  displayName: "Weights & Biases",
  description:
    "Query W&B experiments, Weave traces, artifacts, registries, automations, and reports through the official W&B MCP server.",
  categories: ["AI", "Analytics", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "W&B API Key",
      placeholder: "Paste your W&B API key",
      description:
        "A W&B API key sent to the MCP server as an Authorization Bearer token. Create or copy a key at https://wandb.ai/authorize.",
      extraFields: [
        {
          key: "mcpEndpoint",
          label: "MCP Endpoint URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://mcp.withwandb.com/mcp",
          description:
            "Optional full W&B MCP endpoint. Leave blank to use the hosted service, or enter the /mcp URL exposed by a W&B Dedicated or self-hosted MCP deployment.",
        },
      ],
    },
  ],
  homepageUrl: "https://wandb.ai",
  actions: wandbActions,
};
