import type { ProviderDefinition } from "../../core/types.ts";

import { datadogActions } from "./actions.ts";
import { datadogOAuthScopes } from "./scopes.ts";

const service = "datadog";

/**
 * Datadog provider backed by Datadog API and application keys.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Datadog",
  categories: ["Developer Tools", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://{authorizationHost}/oauth2/v1/authorize",
      tokenUrl: "https://api.{site}/oauth2/v1/token",
      scopes: datadogOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: {
        method: "S256",
      },
      authorizationRequestFields: {
        scope: false,
      },
      clientConfigFields: [
        {
          key: "site",
          label: "Site parameter",
          inputType: "text",
          required: true,
          secret: false,
          defaultValue: "datadoghq.com",
          placeholder: "datadoghq.com",
          description: "The Datadog API site parameter, such as datadoghq.com, datadoghq.eu, or us3.datadoghq.com.",
        },
        {
          key: "authorizationHost",
          label: "Authorization host",
          inputType: "text",
          required: true,
          secret: false,
          defaultValue: "app.datadoghq.com",
          placeholder: "app.datadoghq.com",
          description: "The matching Datadog web application host, such as app.datadoghq.com or app.datadoghq.eu.",
        },
      ],
    },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DATADOG_API_KEY",
      description:
        "Datadog API key used for API requests. Create or view API keys in Organization Settings: https://docs.datadoghq.com/account_management/api-app-keys/",
      extraFields: [
        {
          key: "applicationKey",
          label: "Application Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "DATADOG_APPLICATION_KEY",
          description:
            "Datadog application key required for read API requests. Create or view application keys in Organization Settings: https://docs.datadoghq.com/account_management/api-app-keys/",
        },
        {
          key: "site",
          label: "Datadog Site",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "us1",
          description: "Datadog site for the account. Use one of us1, us3, us5, eu, ap1, ap2, uk1, gov, or gov2.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.datadoghq.com/",
  actions: datadogActions,
};
