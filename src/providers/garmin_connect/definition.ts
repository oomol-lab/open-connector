import type { ProviderDefinition } from "../../core/types.ts";

import { garminConnectActions } from "./actions.ts";

const service = "garmin_connect";

/**
 * Garmin Connect provider backed by the read-only Garmin Connect Personal API,
 * which serves the data of the user who created the key.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Garmin Connect",
  description:
    "Read your own Garmin Connect activities, sleep, HRV, Body Battery, heart rate, daily wellness summaries and weight through the Garmin Connect Personal API.",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal API Key",
      placeholder: "GARMIN_PERSONAL_API_KEY",
      description:
        "A Garmin Connect Personal API key. Create one on the Personal API Key page of Garmin Connect on the web (https://connect.garmin.com/app/settings/personalApiToken). Garmin shows the key once and it expires after the period you choose. It reads only the data of the account that created it.",
    },
  ],
  homepageUrl: "https://connect.garmin.com",
  actions: garminConnectActions,
};
