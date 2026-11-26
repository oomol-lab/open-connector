import type { ProviderDefinition } from "../../core/types.ts";

import { instagramActions, instagramOAuthScopes } from "./actions.ts";

const service = "instagram";

/** Instagram API through an operator-owned app or a pasted access token. */
export const provider: ProviderDefinition = {
  service,
  displayName: "Instagram",
  categories: ["Social", "Marketing"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://www.instagram.com/oauth/authorize",
      tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes: instagramOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        enable_fb_login: "0",
        force_authentication: "1",
      },
      clientConfigFields: [
        {
          key: "loginMode",
          label: "Login mode",
          description:
            "Use unified for Meta Unified Login, or instagram for existing Instagram Login apps. Defaults to instagram.",
          inputType: "text",
          required: false,
          secret: false,
          location: "extra",
        },
        {
          key: "configId",
          label: "Facebook Login for Business Configuration ID",
          description:
            "Required for unified mode. Choose a configuration marked Instagram Login Compatible in your Meta app.",
          inputType: "text",
          required: false,
          secret: false,
          location: "extra",
        },
        {
          key: "instagramAccountId",
          label: "Instagram account ID",
          description:
            "For Unified Login, select an authorized Instagram account when the token reaches several accounts. Omit to use the only account.",
          inputType: "text",
          required: false,
          secret: false,
          location: "extra",
        },
      ],
      clientSetup: {
        docsUrl:
          "https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started",
        steps: [
          "For Unified Login, create a Meta app with the Manage messaging & content on Instagram use case and an Instagram Login Compatible configuration. Set loginMode to unified and enter configId.",
          "Register this runtime's exact /oauth/callback URL as a valid OAuth redirect URI.",
          "Use the Meta App ID and App Secret for Unified Login. Existing Instagram Login apps use their Instagram App ID and App Secret with loginMode set to instagram.",
        ],
      },
    },
    {
      type: "api_key",
      label: "Facebook or Unified Login access token",
      placeholder: "EAAG...",
      description:
        "Use a Unified Login system-user token for shared Instagram accounts, or a Facebook Login token for a Page linked to an Instagram professional account. Grant instagram_basic plus instagram_manage_comments, instagram_manage_insights or instagram_content_publish for the matching actions. Page discovery also needs the applicable Page permissions. OpenConnector does not refresh pasted tokens. send_message requires Instagram Login OAuth.",
      extraFields: [
        {
          key: "instagramAccountId",
          label: "Instagram account ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "17841400000000000",
          description:
            "Only needed when the token reaches several Instagram accounts. Leave empty to use the only account.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.instagram.com/",
  actions: instagramActions,
};
