import type { ProviderDefinition } from "../../core/types.ts";

import { vestaboardActions } from "./actions.ts";

const service = "vestaboard";

export const provider: ProviderDefinition = {
  service,
  displayName: "Vestaboard",
  categories: ["Communication", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Cloud API Token",
      placeholder: "vestaboard_cloud_api_token",
      description:
        "Vestaboard Cloud API token sent with the X-Vestaboard-Token header. Create it in the API tab of the Vestaboard web app or under Settings / Advanced Settings in the mobile app: https://docs.vestaboard.com/docs/read-write-api/authentication.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.vestaboard.com",
  actions: vestaboardActions,
};
