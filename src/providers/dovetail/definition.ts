import type { ProviderDefinition } from "../../core/types.ts";

import { dovetailActions } from "./actions.ts";

const service = "dovetail";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dovetail",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal API Key",
      placeholder: "Paste your Dovetail personal API key",
      description:
        "Dovetail personal API key sent in the Authorization Bearer header. Generate it in Settings -> Account -> Personal API keys: https://dovetail.com/settings/user/account.",
    },
  ],
  homepageUrl: "https://dovetail.com",
  actions: dovetailActions,
};
