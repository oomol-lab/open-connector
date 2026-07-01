import type { ProviderDefinition } from "../../core/types.ts";

import { amaraActions } from "./actions.ts";

const service = "amara";

export const provider: ProviderDefinition = {
  service,
  displayName: "Amara",
  categories: ["Design & Media", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "amara_api_key",
      description:
        "Amara API key sent with the x-api-key header. Generate it from the bottom of your Amara account page as described at https://apidocs.amara.org/.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://amara.org",
  actions: amaraActions,
};
