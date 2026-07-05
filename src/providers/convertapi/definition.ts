import type { ProviderDefinition } from "../../core/types.ts";

import { convertapiActions } from "./actions.ts";

const service = "convertapi";

export const provider: ProviderDefinition = {
  service,
  displayName: "ConvertAPI",
  categories: ["Productivity", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "CONVERTAPI_API_TOKEN",
      description:
        "ConvertAPI API token sent as a Bearer token. Create and manage API tokens in the ConvertAPI authentication dashboard: https://www.convertapi.com/a/authentication.",
    },
  ],
  homepageUrl: "https://www.convertapi.com",
  actions: convertapiActions,
};
