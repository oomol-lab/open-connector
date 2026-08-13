import type { ProviderDefinition } from "../../core/types.ts";

import { trelloActions } from "./actions.ts";
import { trelloOAuthScopes } from "./scopes.ts";

const service = "trello";

export const provider: ProviderDefinition = {
  service,
  displayName: "Trello",
  description:
    "Connect with OAuth using the Trello API Key as the client ID and API Secret as the client secret, or configure an API key and user token manually.",
  categories: ["Productivity"],
  authTypes: ["oauth1", "custom_credential"],
  auth: [
    {
      type: "oauth1",
      requestTokenUrl: "https://trello.com/1/OAuthGetRequestToken",
      authorizationUrl: "https://trello.com/1/OAuthAuthorizeToken",
      accessTokenUrl: "https://trello.com/1/OAuthGetAccessToken",
      signatureMethod: "HMAC-SHA1",
      scopes: trelloOAuthScopes,
      scopeSeparator: ",",
      authorizationParams: {
        expiration: "never",
      },
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
  iconUrl: "/provider-icons/trello.svg",
  actions: trelloActions,
};
