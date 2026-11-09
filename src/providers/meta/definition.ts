import type { ProviderDefinition } from "../../core/types.ts";

import { metaActions } from "./actions.ts";

const service = "meta";

export const provider: ProviderDefinition = {
  service,
  displayName: "Meta",
  categories: ["Marketing", "Social"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://www.facebook.com/v27.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v27.0/oauth/access_token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationRequestFields: { scope: false },
      authorizationParams: { override_default_response_type: "true" },
      clientConfigFields: [
        {
          key: "configId",
          label: "Facebook Login for Business Configuration ID",
          description:
            "Create a configuration for your app at https://developers.facebook.com/apps/ and select the assets and permissions to authorize.",
          required: true,
          inputType: "text",
          location: "extra",
          secret: false,
        },
      ],
    },
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "EAAG...",
      description:
        "Use a User, System User, or Page access token for your assets. Create tokens at https://developers.facebook.com/tools/explorer/ or https://business.facebook.com/latest/settings. Ads queries need ads_read; Page publishing needs pages_manage_posts and pages_read_engagement. A Page token grants access only to its own Page.",
    },
  ],
  homepageUrl: "https://business.meta.com/",
  actions: metaActions,
};
