import type { ProviderDefinition } from "../../core/types.ts";

import { postizActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "postiz",
  displayName: "Postiz",
  description: "List connected social channels and create, schedule, or publish posts through Postiz.",
  categories: ["Social", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "POSTIZ_API_KEY",
      description: "Copy the API key from Settings > Developers > Public API at https://platform.postiz.com/.",
    },
  ],
  homepageUrl: "https://postiz.com",
  actions: postizActions,
};
