import type { ShopifyActionHandler } from "./context.ts";

import { optionalRecord } from "../../core/cast.ts";
import { requiredResponseRecord } from "../provider-runtime.ts";
import { requestShopifyGraphQL } from "./client.ts";

export const graphqlHandlers: Record<string, ShopifyActionHandler> = {
  async execute_graphql(input, context) {
    const payload = await requestShopifyGraphQL(context, context.fetcher, {
      query: String(input.query),
      variables: optionalRecord(input.variables),
    });
    const data = requiredResponseRecord(payload.data, "data");
    const extensions = optionalRecord(payload.extensions);
    return {
      data,
      extensions: extensions ? extensions : undefined,
    };
  },
};
