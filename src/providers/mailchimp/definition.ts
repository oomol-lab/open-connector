import type { ProviderDefinition } from "../../core/types.ts";

import { mailchimpActions } from "./actions.ts";

const service = "mailchimp";

export const provider: ProviderDefinition = {
  service,
  displayName: "Mailchimp",
  categories: ["Communication", "Marketing"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.mailchimp.com/oauth2/authorize",
      tokenUrl: "https://login.mailchimp.com/oauth2/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationRequestFields: {
        scope: false,
      },
    },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "0123456789abcdef-us1",
      description:
        "Mailchimp Marketing API key used with HTTP Basic auth. Generate it under Profile > Extras > API keys: https://mailchimp.com/help/about-api-keys/.",
    },
  ],
  homepageUrl: "https://mailchimp.com",
  actions: mailchimpActions,
};
