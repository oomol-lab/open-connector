import type { ProviderDefinition } from "../../core/types.ts";

import { addresszenActions } from "./actions.ts";

const service = "addresszen";

export const provider: ProviderDefinition = {
  service,
  displayName: "AddressZen",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ak_xxx",
      description:
        "AddressZen API key used as the api_key query parameter. Find or create it from your AddressZen dashboard: https://docs.addresszen.com/docs/guides/api-key",
    },
  ],
  homepageUrl: "https://addresszen.com",
  actions: addresszenActions,
};
