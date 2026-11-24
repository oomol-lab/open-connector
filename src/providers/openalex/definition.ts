import type { ProviderDefinition } from "../../core/types.ts";

import { openalexActions } from "./actions.ts";

const service = "openalex";

export const provider: ProviderDefinition = {
  service,
  displayName: "OpenAlex",
  description:
    "OpenAlex through its public API: search, get and autocomplete works and other entities with an API key. OpenAlex MCP adds analysis, alerts and your own account.",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "OPENALEX_API_KEY",
      description:
        "OpenAlex API key sent as the api_key query parameter. Create or view your key in the OpenAlex API authentication settings: https://developers.openalex.org/api-reference/authentication",
      extraFields: [],
    },
  ],
  homepageUrl: "https://openalex.org/",
  actions: openalexActions,
};
