import type { ProviderDefinition } from "../../core/types.ts";

import { dopplerActions } from "./actions.ts";

const service = "doppler";

export const provider: ProviderDefinition = {
  service,
  displayName: "Doppler",
  categories: ["Developer Tools", "Security"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "dp.pt....",
      description:
        "Doppler API token used with the Authorization Bearer header. For automation, create a service token from Doppler's Access tab as documented at https://docs.doppler.com/docs/service-tokens.",
    },
  ],
  homepageUrl: "https://www.doppler.com",
  actions: dopplerActions,
};
