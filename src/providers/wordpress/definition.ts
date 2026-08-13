import type { ProviderDefinition } from "../../core/types.ts";

import { wordpressActions } from "./actions.ts";

const service = "wordpress";

export const provider: ProviderDefinition = {
  service,
  displayName: "WordPress",
  categories: ["Productivity", "Marketing"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://public-api.wordpress.com/oauth2/authorize",
      tokenUrl: "https://public-api.wordpress.com/oauth2/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Application Password",
      placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx",
      description:
        "WordPress application password used as the Basic Auth password. Create one in WordPress admin from Users > Profile > Application Passwords: https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/#basic-authentication-with-application-passwords",
      extraFields: [
        {
          key: "siteUrl",
          label: "Site URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://example.com",
          description:
            "Public HTTPS WordPress site URL used as the REST API host. Site roots and URLs ending in /wp-json or /wp-json/wp/v2 are accepted.",
        },
        {
          key: "username",
          label: "Username",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "editor",
          description: "WordPress username paired with the application password for REST API Basic authentication.",
        },
      ],
    },
  ],
  homepageUrl: "https://wordpress.org",
  iconUrl: "/provider-icons/wordpress.svg",
  actions: wordpressActions,
};
