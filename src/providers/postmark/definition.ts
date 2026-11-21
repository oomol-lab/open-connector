import type { ProviderDefinition } from "../../core/types.ts";

import { postmarkActions } from "./actions.ts";
import { snapshot } from "./trigger-on-email-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

export const provider: ProviderDefinition = {
  service: "postmark",
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Postmark",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Server Token",
      placeholder: "server_token",
      description:
        "Postmark server token used with the X-Postmark-Server-Token header. Find it under Server > API Tokens: https://postmarkapp.com/support/article/1008-what-are-the-account-and-server-api-tokens.",
    },
  ],
  homepageUrl: "https://postmarkapp.com",
  actions: postmarkActions,
};
