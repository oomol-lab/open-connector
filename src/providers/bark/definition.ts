import type { ProviderDefinition } from "../../core/types.ts";

import { barkActions } from "./actions.ts";

const service = "bark";

export const provider: ProviderDefinition = {
  service,
  displayName: "Bark",
  categories: ["Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Device Key",
      placeholder: "device key or https://api.day.app/{device_key}",
      description:
        "Bark device key used as the device_key field for push requests. Open the Bark iOS app and copy the push URL shown in the tutorial, then paste either the key or full URL: https://bark.day.app/#/tutorial.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Server Base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://api.day.app",
          description:
            "Optional Bark server base URL. Leave empty to use https://api.day.app, or enter your self-hosted Bark server URL from the Bark Server API docs: https://github.com/Finb/bark-server/blob/master/docs/API_V2.md.",
        },
      ],
    },
  ],
  homepageUrl: "https://bark.day.app",
  actions: barkActions,
};
