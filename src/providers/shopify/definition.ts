import type { ProviderDefinition } from "../../core/types.ts";

import { shopifyActions } from "./actions.ts";
import { shopifyOAuthScopes } from "./scopes.ts";

const service = "shopify";

export const provider: ProviderDefinition = {
  service,
  displayName: "Shopify REST Admin (Legacy)",
  categories: ["Marketing", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://{shopDomain}/admin/oauth/authorize",
      tokenUrl: "https://{shopDomain}/admin/oauth/access_token",
      scopes: shopifyOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "shopDomain",
          label: "Shop domain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "acme.myshopify.com",
          description: "The exact myshopify.com domain of the store to authorize, such as acme.myshopify.com.",
        },
      ],
    },
    {
      type: "api_key",
      label: "Admin API access token",
      placeholder: "shpat_...",
      description:
        "Shopify Admin API access token sent with the X-Shopify-Access-Token header. Create or install a custom app and copy its Admin API access token.",
      extraFields: [
        {
          key: "shopDomain",
          label: "Shop domain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "acme.myshopify.com",
          description:
            "The store's myshopify.com domain, such as acme.myshopify.com. A Shopify admin URL for the same shop is also accepted.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.shopify.com",
  actions: shopifyActions,
};
