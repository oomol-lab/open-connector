import type { ProviderDefinition } from "../../core/types.ts";

import { openalexMcpActions } from "./actions.ts";
import { openalexMcpIssuer } from "./endpoints.ts";

const service = "openalex_mcp";

/**
 * OpenAlex provider backed by OpenAlex's official remote MCP server.
 *
 * OpenAlex's MCP authorization server issues public PKCE clients through
 * dynamic registration, so no pre-registered OpenAlex OAuth app is needed: the
 * register step below is scripted for a host to follow. The access token never
 * exposes the user's API key — it is sealed inside the grant server-side — and
 * every tool spends the connected account's daily OpenAlex budget, not ours.
 * Each action maps one MCP tool of the same name; the input schemas are the
 * tool schemas OpenAlex publishes and unknown keys pass through as given.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "OpenAlex MCP",
  description:
    "Search the OpenAlex research catalog — works, authors, institutions, sources, topics, keywords and funders — analyze sets of works, resolve and check references, run OQL queries, find experts, manage literature alerts and curate your own author profile, through OpenAlex's official remote MCP server.",
  categories: ["Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: `${openalexMcpIssuer}/authorize`,
      tokenUrl: `${openalexMcpIssuer}/oauth/token`,
      revocationUrl: `${openalexMcpIssuer}/oauth/token`,
      scopes: ["openalex:query"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      clientSetup: {
        docsUrl: "https://help.openalex.org/access/connector/",
        steps: [
          "Copy the Callback URL shown below.",
          'POST {"client_name":"Open Connector","redirect_uris":["<Callback URL>"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none","scope":"openalex:query"} as JSON to https://mcp.openalex.org/oauth/register.',
          "Copy the returned client_id into the Client ID field below and leave Client Secret empty.",
          "Connect with OAuth and sign in to your OpenAlex account with the passwordless email link.",
        ],
      },
    },
  ],
  homepageUrl: "https://help.openalex.org/access/connector/",
  actions: openalexMcpActions,
};
