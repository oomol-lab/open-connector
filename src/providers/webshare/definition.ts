import type { ProviderDefinition } from "../../core/types.ts";

import { webshareActions } from "./actions.ts";

const service = "webshare";

export const provider: ProviderDefinition = {
  service,
  displayName: "Webshare",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "webshare_api_key",
      description:
        "Webshare API key used with the Authorization: Token header. Create or view API keys in the Webshare dashboard at https://dashboard.webshare.io/userapi/keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.webshare.io/",
  actions: webshareActions,
};
