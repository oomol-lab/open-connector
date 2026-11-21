import type { ProviderDefinition } from "../../core/types.ts";

import { wiseActions } from "./actions.ts";
import { snapshot } from "./trigger-on-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "wise";

export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Wise",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Personal API Token",
      placeholder: "wise_personal_api_token",
      description:
        "Wise personal API token sent as an Authorization Bearer token. Create or view tokens in Wise Business under Your Account > Connect and manage apps > API tokens: https://docs.wise.com/guides/developer/auth-and-security/personal-api-token.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://wise.com",
  actions: wiseActions,
};
