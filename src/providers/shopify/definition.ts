import type { ProviderDefinition } from "../../core/types.ts";

import { shopifyActions } from "./actions.ts";
import { shopifyOAuthScopes } from "./scopes.ts";

const service = "shopify";
const shopifyAuthorizationUrl = "https://{shopSubdomain}.myshopify.com/admin/oauth/authorize";
const shopifyTokenUrl = "https://{shopSubdomain}.myshopify.com/admin/oauth/access_token";

export const provider: ProviderDefinition = {
  service,
  displayName: "Shopify REST Admin (Legacy)",
  categories: ["Marketing", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: shopifyAuthorizationUrl,
      tokenUrl: shopifyTokenUrl,
      scopes: shopifyOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "shopSubdomain",
          label: "Shop subdomain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "acme",
          description: "The store-specific part before .myshopify.com, such as acme for acme.myshopify.com.",
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
