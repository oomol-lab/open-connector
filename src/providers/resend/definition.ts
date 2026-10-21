import type { ProviderDefinition } from "../../core/types.ts";

import { resendActions } from "./actions.ts";
import { snapshot } from "./trigger-on-email-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

export const provider: ProviderDefinition = {
  service: "resend",
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Resend",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Resend API key used with the Authorization Bearer header. Create or manage it from https://resend.com/docs/dashboard/api-keys/introduction.",
    },
  ],
  homepageUrl: "https://resend.com",
  actions: resendActions,
};
