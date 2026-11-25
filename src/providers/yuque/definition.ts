import type { ProviderDefinition } from "../../core/types.ts";

import { yuqueActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "yuque",
  displayName: "Yuque",
  description: "Search and maintain Yuque documents, repositories and tables of contents",
  homepageUrl: "https://www.yuque.com",
  categories: ["Documents", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "YUQUE_ACCESS_TOKEN",
      description:
        "Create a personal access token at https://www.yuque.com/settings/tokens and paste it here. Official documentation lists personal tokens as a Super Member benefit; access follows your account permissions.",
    },
  ],
  actions: yuqueActions,
};
