import type { ProviderDefinition } from "../../core/types.ts";

import { data247Actions } from "./actions.ts";

const service = "data247";

export const provider: ProviderDefinition = {
  service,
  displayName: "Data247",
  categories: ["Data", "Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DATA247_API_KEY",
      description:
        "Data247 v3 API key sent with the key query parameter. The Data247 API manual describes API key usage: https://www.data247.com/api_user_manual",
    },
  ],
  homepageUrl: "https://www.data247.com/",
  actions: data247Actions,
};
