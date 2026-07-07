import type { ProviderDefinition } from "../../core/types.ts";

import { accredibleCertificatesActions } from "./actions.ts";

const service = "accredible_certificates";

export const provider: ProviderDefinition = {
  service,
  displayName: "Accredible Certificates",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ACCREDIBLE_API_KEY",
      description:
        "Accredible API key sent in the Authorization header as Token token=<API key>. Create or view API keys from API Management in Accredible: https://help.accredible.com/s/article/how-do-i-find-my-integration-api-key.",
    },
  ],
  homepageUrl: "https://www.accredible.com/",
  actions: accredibleCertificatesActions,
};
