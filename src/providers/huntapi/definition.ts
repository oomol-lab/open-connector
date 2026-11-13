import type { ProviderDefinition } from "../../core/types.ts";

import { huntapiActions } from "./actions.ts";

const service = "huntapi";

export const provider: ProviderDefinition = {
  service,
  displayName: "HuntAPI",
  categories: ["Design & Media", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "HUNTAPI_API_KEY",
      description:
        "HuntAPI API key sent with the x-api-key header. Create or copy it from your HuntAPI dashboard: https://app.huntapi.com/",
    },
  ],
  homepageUrl: "https://www.huntapi.com",
  actions: huntapiActions,
};
