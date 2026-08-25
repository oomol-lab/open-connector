import type { ProviderDefinition } from "../../core/types.ts";

import { coinbaseActions } from "./actions.ts";
import { coinbaseOAuthScopes } from "./scopes.ts";

const service = "coinbase";

export const provider: ProviderDefinition = {
  service,
  displayName: "Coinbase",
  categories: ["Finance"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.coinbase.com/oauth2/auth",
      tokenUrl: "https://login.coinbase.com/oauth2/token",
      scopes: coinbaseOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: {
        method: "S256",
      },
    },
    {
      type: "api_key",
      label: "API Private Key",
      placeholder: "-----BEGIN EC PRIVATE KEY-----",
      description:
        "Coinbase CDP API private key in PEM format. Create a Secret API Key at https://portal.cdp.coinbase.com/projects/api-keys, choose ECDSA as the signature algorithm, and copy the private key exactly as shown in the creation modal.",
      extraFields: [
        {
          key: "keyName",
          label: "API Key Name",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "organizations/{org_id}/apiKeys/{key_id}",
          description:
            "Coinbase API key name used as the JWT kid and sub. Copy it from the same Secret API Key modal or the API Keys dashboard: https://portal.cdp.coinbase.com/projects/api-keys.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.coinbase.com",
  actions: coinbaseActions,
};
