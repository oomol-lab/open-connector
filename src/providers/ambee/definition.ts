import type { ProviderDefinition } from "../../core/types.ts";

import { ambeeActions } from "./actions.ts";

const service = "ambee";

export const provider: ProviderDefinition = {
  service,
  displayName: "Ambee",
  categories: ["Location", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "AMBEE_API_KEY",
      description:
        "Ambee API key sent with the x-api-key header. Create or copy it from the Access API Keys page in your Ambee account: https://docs.ambeedata.com/access-api-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.getambee.com",
  actions: ambeeActions,
};
