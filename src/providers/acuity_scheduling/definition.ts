import type { ProviderDefinition } from "../../core/types.ts";

import { acuitySchedulingActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "acuity_scheduling",
  displayName: "Acuity Scheduling",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ACUITY_API_KEY",
      description:
        "Acuity Scheduling API Key used as the HTTP Basic password. Create or view it here: https://secure.acuityscheduling.com/app.php?action=settings&key=api",
      extraFields: [
        {
          key: "userId",
          label: "User ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "12345678",
          description:
            "Numeric Acuity Scheduling User ID used as the HTTP Basic username. Find it with your API Key here: https://secure.acuityscheduling.com/app.php?action=settings&key=api",
        },
      ],
    },
  ],
  homepageUrl: "https://acuityscheduling.com/",
  actions: acuitySchedulingActions,
};
