import type { ProviderDefinition } from "../../core/types.ts";

import { sendcloudActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "sendcloud",
  displayName: "SendCloud",
  description: "Send email, manage templates and check account quotas",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API_KEY",
      placeholder: "SENDCLOUD_API_KEY",
      description:
        "Sign in to SendCloud and generate the API_KEY paired with your API_USER. Save it when shown; it cannot be displayed again. Setup: https://www.sendcloud.net/doc/guide/base/#api_key",
      extraFields: [
        {
          key: "apiUser",
          label: "API_USER",
          required: true,
          description:
            "Copy the API_USER paired with this key from your SendCloud account. Its triggered/bulk type must match the email template. See https://www.sendcloud.net/doc/guide/base/#api_user",
          placeholder: "your_api_user",
          inputType: "text",
          secret: false,
        },
      ],
    },
  ],
  homepageUrl: "https://www.sendcloud.net/",
  actions: sendcloudActions,
};
