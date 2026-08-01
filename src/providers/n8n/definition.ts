import type { ProviderDefinition } from "../../core/types.ts";

import { n8nActions } from "./actions.ts";

const service = "n8n";

/**
 * n8n provider backed by the public n8n API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "n8n",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "N8N_API_KEY",
      description:
        "n8n API key sent with the X-N8N-API-KEY request header. Create or view API keys in n8n user settings: https://docs.n8n.io/api/authentication/.",
      extraFields: [
        {
          key: "instanceUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://your-instance.app.n8n.cloud",
          description:
            "Your n8n instance URL, such as https://your-instance.app.n8n.cloud for n8n Cloud or your self-hosted public HTTPS base URL. LAN and overlay-network instances (including plain http://) require the deployment to set OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK=true. URLs ending in /api/v1 are also accepted.",
        },
      ],
    },
  ],
  homepageUrl: "https://n8n.io",
  actions: n8nActions,
};
