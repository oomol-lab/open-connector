import type { ProviderDefinition } from "../../core/types.ts";

import { drataActions } from "./actions.ts";

const service = "drata";

export const provider: ProviderDefinition = {
  service,
  displayName: "Drata",
  categories: ["Security", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "drata_api_key",
      description:
        "Drata API key used with the Authorization Bearer header. Create or view API keys in Drata as documented at https://help.drata.com/en/articles/6695964.",
      extraFields: [
        {
          key: "region",
          label: "Region",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "us",
          description:
            "The Drata public API region for your account: us, eu, or apac. Leave blank for the default US API host documented by Drata.",
        },
      ],
    },
  ],
  homepageUrl: "https://drata.com",
  actions: drataActions,
};
