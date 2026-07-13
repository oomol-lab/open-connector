import type { ProviderDefinition } from "../../core/types.ts";

import { jumpServerActions } from "./actions.ts";

const service = "jumpserver";

/** JumpServer provider backed by the official jumpserver/mcp SSE server. */
export const provider: ProviderDefinition = {
  service,
  displayName: "JumpServer",
  description:
    "Discover and call asset, account, permission, session, audit, and other tools exposed by an official JumpServer MCP server.",
  categories: ["Developer Tools", "Infrastructure", "Security"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "mcpEndpoint",
          label: "MCP SSE Endpoint",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "http://127.0.0.1:8099/sse",
          description:
            "The SSE endpoint of the official jumpserver/mcp server. Localhost, private-network, Tailscale, NetBird, and public HTTPS endpoints are supported. See https://github.com/jumpserver/mcp.",
        },
        {
          key: "token",
          label: "JumpServer Bearer Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Enter the JumpServer API token",
          description:
            "A JumpServer API Bearer token forwarded by jumpserver/mcp to the JumpServer API. If the MCP server enables api_key, configure it to accept this same token.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.jumpserver.org",
  actions: jumpServerActions,
};
