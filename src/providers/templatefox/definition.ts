import type { ProviderDefinition } from "../../core/types.ts";

import { templatefoxActions } from "./actions.ts";

const service = "templatefox";

export const provider: ProviderDefinition = {
  service,
  displayName: "TemplateFox",
  categories: ["Design & Media", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "TEMPLATEFOX_API_KEY",
      description:
        "TemplateFox API key sent with the x-api-key header. Create or copy it from the API key section of the TemplateFox dashboard at https://app.templatefox.com/dashboard; see https://templatefox.com/docs/api-reference.",
    },
  ],
  homepageUrl: "https://templatefox.com",
  actions: templatefoxActions,
};
