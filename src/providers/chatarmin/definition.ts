import type { ProviderDefinition } from "../../core/types.ts";

import { chatarminActions } from "./actions.ts";

const service = "chatarmin";

export const provider: ProviderDefinition = {
  service,
  displayName: "Chatarmin",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "CHATARMIN_API_KEY",
      description:
        "Chatarmin API key sent as a Bearer token. Find it in your Chatarmin dashboard profile settings: https://chatarmin.com/dashboard/profile",
    },
  ],
  homepageUrl: "https://chatarmin.com/",
  actions: chatarminActions,
};
