import type { ProviderDefinition } from "../../core/types.ts";

import { dropboxSignActions } from "./actions.ts";

const service = "dropbox_sign";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dropbox Sign",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
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
