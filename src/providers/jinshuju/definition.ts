import type { ProviderDefinition } from "../../core/types.ts";

import { jinshujuActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "jinshuju",
  displayName: "Jinshuju",
  description: "Find and copy forms, organize folders, and query or update form entries with Jinshuju.",
  homepageUrl: "https://jinshuju.net",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "YOUR_ACCESS_TOKEN",
      description:
        "Create a personal Access Token under Personal Center > API, or an enterprise token under System Settings > Enterprise API, then paste it here. Personal tokens access owned and shared forms; enterprise tokens access all account forms. Setup: https://open.jinshuju.net/api_v1/authentication",
    },
  ],
  actions: jinshujuActions,
};
