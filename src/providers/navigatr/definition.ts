import type { ProviderDefinition } from "../../core/types.ts";

import { navigatrActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "navigatr",
  displayName: "Navigatr",
  homepageUrl: "https://www.navigatr.org",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "NAVIGATR_PERSONAL_ACCESS_TOKEN",
      description:
        "Create a Navigatr personal access token in User Settings → Personal Access Tokens: https://navigatr.app/settings/personal-access-tokens/. It is sent in the X-Access-Token header.",
    },
  ],
  actions: navigatrActions,
};
