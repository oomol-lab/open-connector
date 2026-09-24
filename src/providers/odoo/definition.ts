import type { ProviderDefinition } from "../../core/types.ts";

import { odooActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "odoo",
  displayName: "Odoo",
  description:
    "Query and modify Odoo models through the legacy JSON-RPC API available in Odoo 14–19. JSON-2 and XML-RPC are not supported by this connector.",
  categories: ["ERP", "CRM"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://mycompany.odoo.com",
          description:
            "Your Odoo instance URL, without /jsonrpc. Private network instances require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK on a self-hosted runtime. Loopback and cloud metadata targets remain blocked.",
        },
        {
          key: "database",
          label: "Database",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "mycompany",
          description: "The Odoo database name, not its display label.",
        },
        {
          key: "username",
          label: "Username",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@example.com",
          description: "The login or email of the Odoo user whose access rights will apply.",
        },
        {
          key: "password",
          label: "Password or API Key",
          inputType: "password",
          required: true,
          secret: true,
          description:
            "An Odoo password or API key from Preferences > Account Security. Odoo Online requires an API-enabled plan. Legacy RPC is deprecated since Odoo 19; see https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.odoo.com",
  actions: odooActions,
};
