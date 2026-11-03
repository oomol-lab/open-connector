import type { ProviderDefinition } from "../../core/types.ts";

import { postizActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "postiz",
  displayName: "Postiz",
  description: "List connected social channels and create, schedule, or publish posts through Postiz, cloud or self-hosted.",
  categories: ["Social", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "POSTIZ_API_KEY",
      description:
        "Copy the API key from Settings > Developers > Public API at https://platform.postiz.com/ or from the same settings page on your self-hosted instance.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://postiz.example.com",
          description:
            "Optional base URL of a self-hosted Postiz instance, with or without the /api/public/v1 path. Leave empty to use https://api.postiz.com. Private/overlay targets and plain HTTP require the self-hosted runtime to enable OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK.",
        },
      ],
    },
  ],
  homepageUrl: "https://postiz.com",
  actions: postizActions,
};
