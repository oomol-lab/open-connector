import type { ProviderDefinition } from "../../core/types.ts";

import { airfocusActions } from "./actions.ts";

const service = "airfocus";

export const provider: ProviderDefinition = {
  service,
  displayName: "airfocus",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "AIRFOCUS_PERSONAL_ACCESS_TOKEN",
      description:
        "airfocus personal access token sent as a Bearer token. Include profile:read for connection validation and workspace:read or workspace for the selected actions. Create one under Account settings > API keys: https://help.lucid.co/hc/en-us/articles/43062348823572-Use-an-API-with-airfocus",
      extraFields: [],
    },
  ],
  homepageUrl: "https://airfocus.com/",
  actions: airfocusActions,
};
