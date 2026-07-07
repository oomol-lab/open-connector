import type { ProviderDefinition } from "../../core/types.ts";

import { newsdataIoActions } from "./actions.ts";

const service = "newsdata_io";

export const provider: ProviderDefinition = {
  service,
  displayName: "NewsData.io",
  categories: ["Data", "Social"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "NEWSDATA_IO_API_KEY",
      description:
        "NewsData.io API key sent as the apikey query parameter. View or manage it from https://newsdata.io/api-key.",
    },
  ],
  homepageUrl: "https://newsdata.io",
  actions: newsdataIoActions,
};
