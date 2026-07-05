import type { ProviderDefinition } from "../../core/types.ts";

import { dialpadWfmActions } from "./actions.ts";

const service = "dialpad_wfm";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dialpad WFM",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "DIALPAD_WFM_ACCESS_TOKEN",
      description:
        "Dialpad WFM API access token sent as a Bearer token. Request it from your Dialpad WFM customer success manager as described in the official API docs: https://help.dialpad.com/docs/wfm-apis",
    },
  ],
  homepageUrl: "https://www.dialpad.com/features/workforce-management-software/",
  actions: dialpadWfmActions,
};
