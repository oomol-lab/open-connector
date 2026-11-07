import type { ProviderDefinition } from "../../core/types.ts";

import { shopifyActions } from "./actions.ts";
import { shopifyOAuthScopes, shopifyOptionalScopes } from "./scopes.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-shop-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "shopify";
const shopifyAuthorizationUrl = "https://{shopSubdomain}.myshopify.com/admin/oauth/authorize";
const shopifyTokenUrl = "https://{shopSubdomain}.myshopify.com/admin/oauth/access_token";

export const provider: ProviderDefinition = {
  service,
  displayName: "Shopify",
  categories: ["Marketing", "Data"],
  authTypes: ["oauth2", "api_key", "custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "shopDomain",
          label: "Shop domain",
          inputType: "text",
          required: true,
          secret: false,
          description: "The store's myshopify.com domain.",
        },
        {
          key: "clientId",
          label: "Client ID",
          inputType: "text",
          required: true,
          secret: false,
          description:
            "Client ID of an app owned by the same organization as the store. Create and install it from https://dev.shopify.com/dashboard/.",
        },
        {
          key: "clientSecret",
          label: "Client Secret",
          inputType: "password",
          required: true,
          secret: true,
          description:
            "The same app's client secret. The connector obtains and refreshes its short-lived Admin API access token.",
        },
      ],
    },
    {
      type: "oauth2",
      authorizationUrl: shopifyAuthorizationUrl,
      tokenUrl: shopifyTokenUrl,
      scopes: shopifyOAuthScopes,
      optionalScopes: shopifyOptionalScopes,
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
  triggers: [triggerSnapshot0_0],
  triggerPermissions,
};
