import type { ProviderDefinition } from "../../core/types.ts";

import { actions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "mamo_business",
  displayName: "Mamo Business",
  description: "Review business balances, payment links and payment records in Mamo.",
  categories: ["Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Production API key",
      placeholder: "MAMO_API_KEY",
      description:
        "Create an API key on the Developer page of your Mamo production dashboard and paste it here: https://business.mamopay.com/ . Sandbox keys use a separate environment and are not supported by this connection.",
    },
  ],
  homepageUrl: "https://www.mamopay.com/",
  actions: actions,
};
