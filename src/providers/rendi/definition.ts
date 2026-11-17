import type { ProviderDefinition } from "../../core/types.ts";

import { rendiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "rendi",
  displayName: "Rendi",
  description: "Run FFmpeg in the cloud and manage media files and metadata.",
  categories: ["Design & Media", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "YOUR_RENDI_API_KEY",
      description:
        "Create and activate an account at https://app.rendi.dev/sign-up, then copy your Rendi API key and paste it here.",
    },
  ],
  homepageUrl: "https://www.rendi.dev/",
  actions: rendiActions,
};
