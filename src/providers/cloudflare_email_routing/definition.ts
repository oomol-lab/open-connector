import type { ProviderDefinition } from "../../core/types.ts";

import { cloudflareEmailRoutingActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "cloudflare_email_routing",
  displayName: "Cloudflare Email Routing",
  categories: ["Communication", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "email",
          label: "Cloudflare Account Email",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "you@example.com",
          description:
            "Email address for legacy Global API Key authentication. Leave blank when using a cfut_ User API Token with Email Routing permissions.",
        },
        {
          key: "apiKey",
          label: "Cloudflare API Credential",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "cloudflare_global_api_key",
          description:
            "Use a cfut_ User API Token with Email Routing Rules/Addresses permissions, or a Global API Key (cfk_ or legacy format) with the account email. Cloudflare cfat_ Account API Tokens are not accepted by the Email Routing API: https://developers.cloudflare.com/fundamentals/api/reference/permissions/.",
        },
        {
          key: "accountId",
          label: "Cloudflare Account ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "32-character Cloudflare account ID",
          description:
            "Default account ID for destination addresses and account rule listings. Action inputs may override it.",
        },
        {
          key: "zoneId",
          label: "Cloudflare Zone ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "32-character Cloudflare zone ID",
          description: "Default zone ID for routing rule actions. Action inputs may override it.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.cloudflare.com",
  actions: cloudflareEmailRoutingActions,
};
