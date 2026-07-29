import type { ProviderDefinition } from "../../core/types.ts";

import { photoroomActions } from "./actions.ts";

const service = "photoroom";

export const provider: ProviderDefinition = {
  service,
  displayName: "Photoroom",
  description:
    "Apply controlled ecommerce image edits with Photoroom and store the generated result in local transit storage.",
  categories: ["AI", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PHOTOROOM_API_KEY",
      description:
        "Photoroom API key sent with the x-api-key header. Activate the API and create or manage keys in the Photoroom API dashboard: https://app.photoroom.com/api-dashboard.",
    },
  ],
  homepageUrl: "https://www.photoroom.com",
  actions: photoroomActions,
};
