import type { ProviderDefinition } from "../../core/types.ts";

import { footballDataActions } from "./actions.ts";

const service = "football_data";

/**
 * football-data.org provider backed by the v4 REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "football-data.org",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "FOOTBALL_DATA_API_TOKEN",
      description:
        "football-data.org API token sent with the X-Auth-Token header. Register and manage your token from the official client area: https://www.football-data.org/client/register",
    },
  ],
  homepageUrl: "https://www.football-data.org/",
  actions: footballDataActions,
};
