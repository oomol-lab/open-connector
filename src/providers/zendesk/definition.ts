import type { ProviderDefinition } from "../../core/types.ts";

import { zendeskActions } from "./actions.ts";
import { zendeskOAuthScopes } from "./scopes.ts";

const service = "zendesk";

export const provider: ProviderDefinition = {
  service,
  displayName: "Zendesk",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://{subdomain}.zendesk.com/oauth/authorizations/new",
      tokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
      refreshTokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
      scopes: zendeskOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "subdomain",
          label: "Subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your-workspace",
          description: "The Zendesk account subdomain used to build https://<subdomain>.zendesk.com requests.",
          location: "extra",
        },
      ],
    },
    {
      type: "api_key",
      label: "API Token",
      placeholder: "zendesk_api_token",
      description:
        "Zendesk API token used with Basic auth as <email>/token together with the account subdomain. Generate it in Admin Center > Apps and integrations > APIs > API tokens.",
      extraFields: [
        {
          key: "subdomain",
          label: "Subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your-workspace",
          description: "The Zendesk account subdomain used to build https://<subdomain>.zendesk.com API requests.",
        },
        {
          key: "email",
          label: "Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "agent@example.com",
          description: "The Zendesk user email paired with the API token for Basic auth.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.zendesk.com",
  actions: zendeskActions,
};
