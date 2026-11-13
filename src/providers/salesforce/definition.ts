import type { ProviderDefinition } from "../../core/types.ts";

import { salesforceActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "salesforce",
  displayName: "Salesforce",
  categories: ["Productivity"],
  homepageUrl: "https://www.salesforce.com",
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["refresh_token"],
      authorizationUrl: "https://login.salesforce.com/services/oauth2/authorize",
      tokenUrl: "https://login.salesforce.com/services/oauth2/token",
      scopes: ["api", "refresh_token"],
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: { method: "S256" },
      clientConfigFields: [
        {
          key: "loginUrl",
          label: "Salesforce login URL",
          inputType: "text",
          required: false,
          secret: false,
          defaultValue: "https://login.salesforce.com",
          placeholder: "https://login.salesforce.com",
          description:
            "Use https://login.salesforce.com for production, https://test.salesforce.com for a sandbox, or your HTTPS My Domain URL from Salesforce Setup > My Domain.",
        },
      ],
      clientSetup: {
        docsUrl: "https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm&type=5",
        steps: [
          "Create a Salesforce External Client App or Connected App with OAuth enabled.",
          "Register the callback URL shown here and enable api and refresh_token scopes.",
          "Enable the authorization code flow with PKCE and configure the app's client ID and client secret here.",
          "Use the sandbox login URL for sandbox organizations, or the organization's My Domain URL when required by its login policy.",
        ],
      },
    },
  ],
  actions: salesforceActions,
};
