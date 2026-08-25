import type { ProviderDefinition } from "../../core/types.ts";

import { hithinkFinanceActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "hithink_finance",
  displayName: "Tonghuashun Financial Data",
  description: "Read A-share, index, public-fund, auction, ranking, and market-dump data from Tonghuashun.",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "TONGHUASHUN_API_KEY",
      description:
        "Create and manage an API key in the official Tonghuashun Financial Data documentation portal: https://fuyao.aicubes.cn/docs/",
    },
  ],
  homepageUrl: "https://fuyao.aicubes.cn/docs/",
  actions: hithinkFinanceActions,
};
