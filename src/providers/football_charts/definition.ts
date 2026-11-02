import type { ProviderDefinition } from "../../core/types.ts";

import { footballChartsActions } from "./actions.ts";

const service = "football_charts";

export const provider: ProviderDefinition = {
  service,
  displayName: "Football Charts",
  description:
    "Read football standings, match results, upcoming fixtures with calibrated Dixon-Coles probabilities, 10,000-run Monte Carlo season projections, goal-timing distributions, and model calibration records across 98 leagues in 44 countries.",
  categories: ["Data"],
  authTypes: ["no_auth", "api_key"],
  auth: [
    { type: "no_auth" },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fc_...",
      description:
        "Optional Football Charts API key sent as a Bearer token. Read endpoints work without a key at 100 requests/day per IP (20/min). A free key for personal use raises the limit to 200 requests/day per email address (60/min) across the current and previous season of all 98 leagues; paid plans unlock historical seasons back to 2020. Register at https://www.football-charts.com/developers.",
    },
  ],
  homepageUrl: "https://www.football-charts.com/developers",
  actions: footballChartsActions,
};
