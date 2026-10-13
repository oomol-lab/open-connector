import type { ShopifyActionHandler } from "./context.ts";

import { requiredResponseRecord } from "../provider-runtime.ts";
import { requestShopifyGraphQL } from "./client.ts";
import { normalizeShop } from "./runtime-common.ts";

const getShopQuery = "query ShopifyGetShop { shop { id name myshopifyDomain primaryDomain { url host } } }";

export const shopHandlers: Record<string, ShopifyActionHandler> = {
  async get_shop(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: getShopQuery,
    });
    return {
      shop: normalizeShop(requiredResponseRecord(requiredResponseRecord(payload.data, "data").shop, "shop")),
    };
  },
};
