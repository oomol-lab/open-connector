import type { ProviderDefinition } from "../../core/types.ts";

import { workpathActions } from "./actions.ts";

const service = "workpath";

export const provider: ProviderDefinition = {
  service,
  displayName: "Workpath",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "workpath_api_token",
      description:
        "Workpath Connect API token sent with the Authorization Bearer header. Admins can create API clients from Workpath Organization Settings > API Clients.",
    },
  ],
  homepageUrl: "https://www.workpath.com/",
  actions: workpathActions,
};
