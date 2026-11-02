import type { ProviderDefinition } from "../../core/types.ts";

import { instagramActions, instagramOAuthScopes } from "./actions.ts";

const service = "instagram";

/** Instagram API provider: OAuth through an operator-owned Meta app, or a pasted Facebook Login access token. */
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
      clientSetup: {
        docsUrl:
          "https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login",
        steps: [
          "Create a Meta Business app, add the Instagram product, and configure Business Login for Instagram.",
          "Register this runtime's exact /oauth/callback URL as a valid OAuth redirect URI.",
          "Copy the Instagram App ID and App Secret into the local OAuth client configuration.",
        ],
      },
    },
    {
      type: "api_key",
      label: "Facebook Login access token",
      placeholder: "EAAG...",
      description:
        "Instagram API with Facebook Login: a Page access token, or a user or system-user token that can list Pages, for a Facebook Page linked to an Instagram Business or Creator account. Grant instagram_basic, pages_show_list and pages_read_engagement, plus instagram_manage_comments, instagram_manage_insights or instagram_content_publish for the matching actions. Prefer a long-lived or system-user token; OpenConnector does not refresh it. Messaging (send_message) requires OAuth.",
      extraFields: [
        {
          key: "instagramAccountId",
          label: "Instagram account ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "17841400000000000",
          description:
            "Only needed when the token reaches several Pages that each link an Instagram account. Leave empty to use the only linked account.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.instagram.com/",
  actions: instagramActions,
};
