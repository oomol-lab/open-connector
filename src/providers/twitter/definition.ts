import type { ProviderDefinition } from "../../core/types.ts";

import { twitterActions } from "./actions.ts";

const service = "twitter";

const twitterOAuthScopes = [
  "tweet.read",
  "users.read",
  "tweet.write",
  "media.write",
  "offline.access",
  "follows.read",
  "follows.write",
  "like.read",
  "like.write",
  "list.read",
  "list.write",
  "bookmark.read",
  "bookmark.write",
  "dm.read",
  "dm.write",
  "mute.read",
  "mute.write",
  "space.read",
];

export const provider: ProviderDefinition = {
  service,
  displayName: "X (Twitter)",
  categories: ["Social", "Marketing"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://x.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      scopes: twitterOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
      pkce: {
        method: "S256",
      },
      clientConfigFields: [
        {
          key: "appBearerToken",
          label: "App Bearer Token",
          inputType: "password",
          required: false,
          secret: true,
          location: "secretExtra",
          placeholder: "twitter_app_bearer_token",
          description: "Optional X app-only bearer token used by full archive search and compliance job actions.",
        },
      ],
    },
    {
      type: "custom_credential",
      fields: [
        {
          key: "userAccessToken",
          label: "User Access Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "twitter_oauth2_user_access_token",
          description:
            "X OAuth 2.0 user access token sent with the Authorization Bearer header. The token must include the action's required X user scopes.",
        },
        {
          key: "appBearerToken",
          label: "App Bearer Token",
          inputType: "password",
          required: false,
          secret: true,
          placeholder: "twitter_app_bearer_token",
          description: "Optional X app-only bearer token used by full archive search and compliance job actions.",
        },
      ],
      testAction: {
        actionName: "user_lookup_me",
        input: {},
      },
    },
  ],
  homepageUrl: "https://x.com",
  actions: twitterActions,
};
