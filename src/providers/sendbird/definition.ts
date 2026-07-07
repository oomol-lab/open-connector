import type { ProviderDefinition } from "../../core/types.ts";

import { sendbirdActions } from "./actions.ts";

const service = "sendbird";

export const provider: ProviderDefinition = {
  service,
  displayName: "Sendbird",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "SENDBIRD_API_TOKEN",
      description:
        "Sendbird API token used with the Api-Token header. Find it in Sendbird Dashboard under Settings > Application > General > API tokens: https://sendbird.com/docs/chat/platform-api/v3/prepare-to-use-api.",
      extraFields: [
        {
          key: "applicationId",
          label: "Application ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "sendbird-app-id",
          description:
            "The Sendbird application ID used in the Platform API base URL, for example https://api-{application_id}.sendbird.com/v3.",
        },
      ],
    },
  ],
  homepageUrl: "https://sendbird.com",
  actions: sendbirdActions,
};
