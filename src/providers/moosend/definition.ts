import type { ProviderDefinition } from "../../core/types.ts";

import { moosendActions } from "./actions.ts";

const service = "moosend";

export const provider: ProviderDefinition = {
  service,
  displayName: "Moosend",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MOOSEND_API_KEY",
      description:
        "Moosend API key sent as the apikey query parameter. Copy it from More > Settings > API key in your Moosend account: https://docs.moosend.com/api-documentation/articles/KnowledgeBase/54552-Authenticate-a-Moosend-API-request",
    },
  ],
  homepageUrl: "https://www.moosend.com/",
  actions: moosendActions,
};
