import type { ProviderDefinition } from "../../core/types.ts";

import { venafiTlsProtectCloudActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "venafitlsprotectcloud",
  displayName: "Venafi TLS Protect Cloud",
  categories: ["Security", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Paste your Venafi API key",
      description:
        "The API key sent as tppl-api-key. Copy it from Avatar > Preferences > API Keys: https://docs.venafi.cloud/api/obtaining-api-key/",
      extraFields: [
        {
          key: "region",
          label: "Region",
          inputType: "text",
          placeholder: "us",
          description: "Venafi Cloud region: us or eu.",
          required: true,
          secret: false,
        },
      ],
    },
  ],
  homepageUrl: "https://www.paloaltonetworks.com/network-security/next-gen-trust-security/certificate-manager",
  actions: venafiTlsProtectCloudActions,
};
