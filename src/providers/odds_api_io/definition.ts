import type { ProviderDefinition } from "../../core/types.ts";

import { oddsApiIoActions } from "./actions.ts";

const service = "odds_api_io";

export const provider: ProviderDefinition = {
  service,
  displayName: "Odds-API.io",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ODDS_API_IO_API_KEY",
      description:
        "Odds-API.io API key sent as the apiKey query parameter. Find it in your Odds-API.io account: https://odds-api.io",
    },
  ],
  homepageUrl: "https://odds-api.io",
  actions: oddsApiIoActions,
};
