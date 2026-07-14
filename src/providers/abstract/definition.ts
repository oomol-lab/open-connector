import type { ProviderDefinition } from "../../core/types.ts";

import { abstractActions } from "./actions.ts";

const service = "abstract";

/**
 * Abstract provider backed by the public Abstract Email Validation API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Abstract",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Email Validation API Key",
      placeholder: "ABSTRACT_EMAIL_VALIDATION_API_KEY",
      description:
        "Abstract Email Validation API key sent as the api_key query parameter. Get it from the Email Validation API section of your Abstract dashboard: https://app.abstractapi.com/api/email-validation/dashboard.",
    },
  ],
  homepageUrl: "https://www.abstractapi.com/",
  actions: abstractActions,
};
