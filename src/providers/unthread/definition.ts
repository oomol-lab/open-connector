import type { ProviderDefinition } from "../../core/types.ts";

import { unthreadActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "unthread",
  displayName: "Unthread",
  categories: ["Communication", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Service Account API Key",
      placeholder: "YOUR_UNTHREAD_API_KEY",
      description:
        "Unthread service-account key sent in the X-Api-Key header. Create one from the service account settings documented at https://docs.unthread.io/docs/api-docs/api-reference#create-a-service-account-to-generate-an-api-key.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://unthread.io/",
  actions: unthreadActions,
};
