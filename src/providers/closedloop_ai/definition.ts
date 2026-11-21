import type { ProviderDefinition } from "../../core/types.ts";

import { closedloopAiActions } from "./actions.ts";

/** Consumer-managed public OAuth for the documented US regional MCP. */
export const provider: ProviderDefinition = {
  service: "closedloop_ai",
  displayName: "ClosedLoop AI",
  description: "Read product insights and trace them to conversation evidence in a US-region ClosedLoop AI workspace.",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://mcp.closedloop.sh/authorize",
      issuer: "https://mcp.closedloop.sh",
      resource: "https://mcp.closedloop.sh",
      tokenUrl: "https://mcp.closedloop.sh/token",
      scopes: ["mcp:read"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      clientSetup: {
        docsUrl: "https://closedloop.sh/docs/mcp-server/overview",
        steps: [
          "This provider connects US-region workspaces; do not use an EU workspace credential with it.",
          "Copy the runtime Callback URL. Register that exact redirect URI as a public OAuth client at https://mcp.closedloop.sh/register with client_name, redirect_uris, grant_types [authorization_code, refresh_token], response_types [code], token_endpoint_auth_method none and scope mcp:read.",
          "Copy the returned client_id into Client ID and leave Client Secret empty; the runtime does not register clients for you.",
          "Connect with OAuth, select only the workspace you intend to expose to this runtime, and authorize its read-only access.",
        ],
      },
    },
  ],
  homepageUrl: "https://closedloop.sh/",
  actions: closedloopAiActions,
};
