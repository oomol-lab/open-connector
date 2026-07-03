import type { ProviderDefinition } from "../../core/types.ts";

import { bigDataCloudActions } from "./actions.ts";

const service = "big_data_cloud";

export const provider: ProviderDefinition = {
  service,
  displayName: "BigDataCloud",
  categories: ["Location", "Security", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BIGDATACLOUD_API_KEY",
      description:
        "BigDataCloud API key passed with the key query parameter. Create your account and get a key here: https://www.bigdatacloud.com/docs/getting-started",
    },
  ],
  homepageUrl: "https://www.bigdatacloud.com",
  actions: bigDataCloudActions,
};
