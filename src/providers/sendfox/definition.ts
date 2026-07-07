import type { ProviderDefinition } from "../../core/types.ts";

import { sendfoxActions } from "./actions.ts";

const service = "sendfox";

export const provider: ProviderDefinition = {
  service,
  displayName: "SendFox",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "sendfox_pat_...",
      description:
        "SendFox personal access token sent with the Authorization Bearer header. Create or manage tokens from your SendFox OAuth settings: https://sendfox.com/account/oauth.",
    },
  ],
  homepageUrl: "https://sendfox.com",
  actions: sendfoxActions,
};
