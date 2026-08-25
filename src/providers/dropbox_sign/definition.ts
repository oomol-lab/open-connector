import type { ProviderDefinition } from "../../core/types.ts";

import { dropboxSignActions } from "./actions.ts";

const service = "dropbox_sign";
const dropboxSignAuthorizationUrl = "https://app.hellosign.com/oauth/authorize";
const dropboxSignTokenUrl = "https://app.hellosign.com/oauth/token";
const dropboxSignRefreshTokenUrl = "https://app.hellosign.com/oauth/token?refresh";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dropbox Sign",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: dropboxSignAuthorizationUrl,
      tokenUrl: dropboxSignTokenUrl,
      refreshTokenUrl: dropboxSignRefreshTokenUrl,
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFields: {
        authorizationCode: {
          state: "state",
        },
      },
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
