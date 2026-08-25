import type { ProviderDefinition } from "../../core/types.ts";

import { pushsaferActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "pushsafer",
  displayName: "Pushsafer",
  categories: ["Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Private Key",
      placeholder: "YOUR_PRIVATE_KEY",
      description:
        "Pushsafer Private Key used to authenticate API requests. Find it in your Pushsafer dashboard: https://www.pushsafer.com/.",
      extraFields: [
        {
          key: "username",
          label: "Username or Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "you@example.com",
          description:
            "Pushsafer username or email address paired with the Private Key for key validation and device or group discovery.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.pushsafer.com/",
  actions: pushsaferActions,
};
