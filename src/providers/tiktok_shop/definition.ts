import type { ProviderDefinition } from "../../core/types.ts";

import { actions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "tiktok_shop",
  displayName: "TikTok Shop",
  description: "Read authorized shops, product inventories and order details",
  categories: ["Cross-border E-commerce"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://services.tiktokshop.com/open/authorize",
      tokenUrl: "https://auth.tiktok-shops.com/api/v2/token/get",
      refreshTokenUrl: "https://auth.tiktok-shops.com/api/v2/token/refresh",
      scopes: ["seller.authorization.info", "seller.product.basic", "seller.order.info"],
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "serviceId",
          label: "Service ID",
          inputType: "text",
          required: true,
          description:
            "Service ID from App & Service in https://partner.tiktokshop.com/ or https://partner.us.tiktokshop.com/. Use the app key as Client ID and app secret as Client Secret.",
          secret: false,
        },
        {
          key: "market",
          label: "Authorization market",
          inputType: "text",
          required: true,
          description: "US for US seller authorization or ROW for other markets.",
          secret: false,
        },
      ],
    },
  ],
  homepageUrl: "https://shop.tiktok.com/",
  actions: actions,
};
