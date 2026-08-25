import type { ProviderDefinition } from "../../core/types.ts";

import { spyfuActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "spyfu",
  displayName: "SpyFu",
  description: "Inspect SpyFu account usage and SEO or PPC competitive research data.",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret Key",
      placeholder: "SPYFU_SECRET_KEY",
      description:
        "SpyFu Secret Key sent as the api_key query parameter. Copy it from Account Settings > API Usage: https://www.spyfu.com/account/api",
    },
  ],
  homepageUrl: "https://www.spyfu.com/",
  actions: spyfuActions,
};
