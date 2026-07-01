import type { ProviderDefinition } from "../../core/types.ts";

import { flomoActions } from "./actions.ts";

const service = "flomo";

/**
 * flomo provider backed by incoming webhooks and the flomo Max MCP server.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "flomo",
  categories: ["Productivity"],
  authTypes: ["api_key", "custom_credential"],
  auth: [
    {
      type: "api_key",
      label: "Incoming Webhook URL",
      placeholder: "https://flomoapp.com/iwh/...",
      description:
        "Paste your dedicated flomo incoming webhook URL. You can copy it from https://flomoapp.com/mine?source=incoming_webhook.",
    },
    {
      type: "custom_credential",
      fields: [
        {
          key: "token",
          label: "MCP Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "flomo_mcp_token",
          description:
            "flomo MCP token used with the Authorization: Bearer header for https://flomoapp.com/mcp. This requires a flomo Max membership: https://help.flomoapp.com/membership/pro.html. Create or copy the token from the flomo MCP Token setup page: https://help.flomoapp.com/advance/mcp/token.html.",
        },
      ],
    },
  ],
  homepageUrl: "https://flomoapp.com",
  actions: flomoActions,
};
