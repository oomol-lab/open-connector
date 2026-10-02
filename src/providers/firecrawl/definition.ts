import type { ProviderDefinition } from "../../core/types.ts";

import { firecrawlActions } from "./actions.ts";

const service = "firecrawl";

/**
 * Firecrawl provider backed by the Firecrawl REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Firecrawl",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fc-...",
      description:
        "Firecrawl API key used with the Authorization Bearer header. Create it in Firecrawl API Keys: https://firecrawl.dev/app/api-keys.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Base URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://firecrawl.example.com",
          description:
            "Optional base URL of a self-hosted Firecrawl instance, without the /v1 or /v2 path. Leave empty to use https://api.firecrawl.dev. HTTPS is recommended. HTTP sends your API key and request content in plaintext; use it only on a trusted network. Private/overlay targets (RFC 1918, Tailscale, NetBird, private hostnames) require the self-hosted runtime to enable OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.firecrawl.dev",
  actions: firecrawlActions,
};
