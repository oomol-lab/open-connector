import type { ProviderDefinition } from "../../core/types.ts";

import { apiflashActions } from "./actions.ts";

const service = "apiflash";

export const provider: ProviderDefinition = {
  service,
  displayName: "ApiFlash",
  categories: ["Developer Tools", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access Key",
      placeholder: "af_live_xxx",
      description:
        "ApiFlash access key passed as the access_key query parameter. Create or copy it from your dashboard: https://apiflash.com/dashboard/access_keys",
    },
  ],
  homepageUrl: "https://apiflash.com",
  actions: apiflashActions,
};
