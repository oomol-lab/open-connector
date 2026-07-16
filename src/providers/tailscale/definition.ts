import type { ProviderDefinition } from "../../core/types.ts";

import { tailscaleActions } from "./actions.ts";

const service = "tailscale";

export const provider: ProviderDefinition = {
  service,
  displayName: "Tailscale",
  description:
    "Manage devices, DNS, users, keys, policy files, logs, settings, and integrations in a Tailscale tailnet through the official REST API.",
  categories: ["Security", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "clientId",
          label: "OAuth Client ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "TS_API_CLIENT_ID",
          description:
            "Tailscale OAuth client ID created from the Trust credentials page in the Tailscale admin console.",
        },
        {
          key: "clientSecret",
          label: "OAuth Client Secret",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "TS_API_CLIENT_SECRET",
          description:
            "Tailscale OAuth client secret paired with the client ID. Tailscale only shows this secret when the OAuth client is created.",
        },
        {
          key: "tailnet",
          label: "Tailnet ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "-",
          description:
            "Optional tailnet ID used in Tailscale API paths. Leave blank to use Tailscale's '-' shorthand for the OAuth client's tailnet.",
        },
      ],
    },
  ],
  homepageUrl: "https://tailscale.com",
  actions: tailscaleActions,
};
