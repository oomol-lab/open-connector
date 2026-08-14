import type { ProviderDefinition } from "../../core/types.ts";

import { dropboxSignActions } from "./actions.ts";

const service = "dropbox_sign";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dropbox Sign",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://app.hellosign.com/oauth/authorize",
      tokenUrl: "https://app.hellosign.com/oauth/token",
      refreshTokenUrl: "https://app.hellosign.com/oauth/token?refresh",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationRequestFields: {
        scope: false,
      },
    },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DROPBOX_SIGN_API_KEY",
      description:
        "Dropbox Sign API key used as the Basic Auth username. Create or view API keys from the API tab of your Dropbox Sign API Settings page: https://app.hellosign.com/home/myAccount?current_tab=integrations#api.",
    },
  ],
  homepageUrl: "https://sign.dropbox.com",
  actions: dropboxSignActions,
};
