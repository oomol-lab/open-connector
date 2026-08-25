import type { ProviderDefinition } from "../../core/types.ts";

import { trendshiftActions } from "./actions.ts";

const service = "trendshift";

export const provider: ProviderDefinition = {
  service,
  displayName: "Trendshift",
  description: "Query current and historical repository trends from the Trendshift Signal API.",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "ts_live_...",
      description:
        "Trendshift Signal API token sent with the Authorization Bearer header. Subscribe and obtain access from the official Signal page: https://trendshift.io/signal",
    },
  ],
  homepageUrl: "https://trendshift.io/",
  actions: trendshiftActions,
};
