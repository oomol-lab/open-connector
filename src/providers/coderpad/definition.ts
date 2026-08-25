import type { ProviderDefinition } from "../../core/types.ts";

import { coderpadActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "coderpad",
  displayName: "CoderPad",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Interview API Key",
      placeholder: "YOUR_CODERPAD_INTERVIEW_API_KEY",
      description:
        "CoderPad Interview API key used with the Authorization header. Enterprise administrators can view or generate it at https://app.coderpad.io/dashboard/settings.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://coderpad.io",
  actions: coderpadActions,
};
