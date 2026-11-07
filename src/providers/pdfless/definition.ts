import type { ProviderDefinition } from "../../core/types.ts";

import { pdflessActions } from "./actions.ts";

const service = "pdfless";

export const provider: ProviderDefinition = {
  service,
  displayName: "Pdfless",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "pdfless_api_key",
      description:
        "Pdfless API key used with the apikey header. Create it from your Pdfless account as described at https://docs.pdfless.com/authentication.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://pdfless.com",
  actions: pdflessActions,
};
