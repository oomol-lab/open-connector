import type { ProviderDefinition } from "../../core/types.ts";

import { esignaturesIoActions } from "./actions.ts";

const service = "esignatures_io";

export const provider: ProviderDefinition = {
  service,
  displayName: "eSignatures.com",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret Token",
      placeholder: "YOUR_SECRET_TOKEN",
      description:
        "eSignatures.com Secret Token used as the HTTP Basic Auth username with an empty password. Find it on the API page after signing in to your eSignatures.com account: https://esignatures.com/docs/api.",
    },
  ],
  homepageUrl: "https://esignatures.com",
  actions: esignaturesIoActions,
};
