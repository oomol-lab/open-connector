import type { ProviderDefinition } from "../../core/types.ts";

import { formstackActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "formstack",
  displayName: "Formstack",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "fs_pat_...",
      description: "Formstack personal access token created in the Formstack API settings.",
    },
  ],
  homepageUrl: "https://www.formstack.com/",
  actions: formstackActions,
};
