import type { ProviderDefinition } from "../../core/types.ts";

import { linearActions } from "./actions.ts";
import { linearOAuthScopes } from "./scopes.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-issue-changed.definition.ts";
import { snapshot as issueEventSnapshot } from "./trigger-on-issue-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "linear";

/**
 * Linear provider backed by the Linear GraphQL API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Linear",
  description:
    "Linear through its API: typed operations and triggers on issue events, with OAuth or an API key. Linear MCP offers Linear's own, smaller tool set instead.",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://linear.app/oauth/authorize",
      tokenUrl: "https://api.linear.app/oauth/token",
      scopes: linearOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {},
    },
    {
      type: "api_key",
      label: "Personal API Key",
      description:
        "Linear personal API key sent as the raw Authorization header value. Create or revoke it from Settings > Account > Security & Access.",
      placeholder: "lin_api_...",
      extraFields: [],
    },
  ],
  homepageUrl: "https://linear.app",
  actions: linearActions,
  triggers: [triggerSnapshot0_0, issueEventSnapshot],
  triggerPermissions,
};
