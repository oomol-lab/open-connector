import type { ProviderDefinition } from "../../core/types.ts";

import { trelloActions } from "./actions.ts";
import { snapshot } from "./trigger-on-model-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "trello";

export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Trello",
  categories: ["Productivity"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["read:member:trello", "offline_access"],
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: [
        "read:board:trello",
        "read:enterprise:trello",
        "read:member:trello",
        "read:organization:trello",
        "write:board:membership:trello",
        "write:board:trello",
        "write:enterprise:trello",
        "write:member:trello",
        "write:organization:membership:trello",
        "write:organization:trello",
      ],
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
      pkce: { method: "S256" },
      authorizationParams: { prompt: "consent" },
    },
    {
      type: "custom_credential",
      fields: [
        {
          key: "apiKey",
          label: "API Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Trello API key",
          description:
            "Trello API Key from the API Key tab at https://trello.com/apps/admin. Do not use the API Secret or an Atlassian API token here.",
        },
        {
          key: "apiToken",
          label: "API Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Trello API token",
          description:
            "Trello API token generated from the Token link beside your API Key at https://trello.com/apps/admin. This is different from the API Secret.",
        },
      ],
      testAction: {
        actionName: "get_member",
        input: {},
      },
    },
  ],
  homepageUrl: "https://trello.com",
  actions: trelloActions,
};
