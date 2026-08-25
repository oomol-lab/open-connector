import type { ProviderDefinition } from "../../core/types.ts";

import { bamboohrActions } from "./actions.ts";
import {
  bamboohrCompanyInfoScope,
  bamboohrEmployeeScope,
  bamboohrFieldScope,
  bamboohrOAuthAuthorizationUrl,
  bamboohrOAuthTokenUrl,
  bamboohrOfflineAccessScope,
} from "./constants.ts";

const service = "bamboohr";

export const provider: ProviderDefinition = {
  service,
  displayName: "BambooHR",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: bamboohrOAuthAuthorizationUrl,
      tokenUrl: bamboohrOAuthTokenUrl,
      refreshTokenUrl: bamboohrOAuthTokenUrl,
      scopes: [bamboohrOfflineAccessScope, bamboohrCompanyInfoScope, bamboohrEmployeeScope, bamboohrFieldScope],
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        request: "authorize",
      },
      clientConfigFields: [
        {
          key: "companyDomain",
          label: "Company Domain",
          inputType: "text",
          placeholder: "acme",
          description: "The subdomain from your BambooHR company URL. For https://acme.bamboohr.com, enter acme.",
          required: true,
          secret: false,
        },
      ],
    },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BAMBOOHR_API_KEY",
      description:
        "BambooHR API key used as the Basic Auth username with x as the password. Generate it from the user menu in BambooHR under API Keys: https://documentation.bamboohr.com/docs/getting-started.",
      extraFields: [
        {
          key: "companyDomain",
          label: "Company Domain",
          inputType: "text",
          placeholder: "acme",
          description:
            "BambooHR company subdomain used to build https://<companyDomain>.bamboohr.com API requests. Use only the subdomain, not the full URL.",
          required: true,
          secret: false,
        },
      ],
    },
  ],
  homepageUrl: "https://www.bamboohr.com",
  actions: bamboohrActions,
};
