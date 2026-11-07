import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const shop = s.nonEmptyString("Shop cipher returned by list_authorized_shops. Select the intended shop explicitly.");
const pageSize = s.integer("Number of results per page. Defaults to 20.", {
  minimum: 1,
  maximum: 100,
  default: 20,
});
const pageToken = s.string("Opaque next_page_token from the previous response. Omit for the first page.");
const id = s.nonEmptyString("TikTok Shop resource ID.");
const locale = s.string("BCP-47 locale for category information. Defaults to the shop locale.");
const product = s.looseObject("TikTok Shop product, including upstream SKU, inventory, pricing and audit fields.", {
  id: s.string("Product ID."),
  title: s.string("Product title."),
  status: s.string("Product status."),
});
const order = s.looseObject(
  "TikTok Shop order with payment, line items and fulfillment details. Buyer data may be masked by TikTok based on app category and market.",
  {
    id: s.string("Order ID."),
    status: s.string("Order status."),
  },
);
const pagination = {
  next_page_token: s.string("Cursor for the next page; absent or empty when no further page is available."),
  total_count: s.integer("Total number of matching records reported by TikTok Shop."),
};
const productFilters = {
  status: s.stringEnum("Product base-version status; does not select post-live drafts. Defaults to ALL.", [
    "ALL",
    "DRAFT",
    "PENDING",
    "FAILED",
    "ACTIVATE",
    "SELLER_DEACTIVATED",
    "PLATFORM_DEACTIVATED",
    "FREEZE",
    "DELETED",
  ]),
  seller_skus: s.array("Filter by seller SKU codes.", s.nonEmptyString("Seller SKU code.")),
  sku_ids: s.array("Filter by up to 10 SKU IDs.", id, { maxItems: 10 }),
  create_time_ge: s.integer("Inclusive creation time lower bound, in Unix seconds."),
  create_time_le: s.integer("Inclusive creation time upper bound, in Unix seconds."),
  update_time_ge: s.integer("Inclusive update time lower bound, in Unix seconds."),
  update_time_le: s.integer("Inclusive update time upper bound, in Unix seconds."),
  category_version: s.stringEnum("Category tree version: v2 for US, v1 for other markets. Omit to include both.", [
    "v1",
    "v2",
  ]),
  listing_quality_tiers: s.array(
    "Listing quality tiers; available for the US market.",
    s.stringEnum("Listing quality tier.", ["POOR", "FAIR", "GOOD", "EXCELLENT"]),
  ),
  listing_platforms: s.array(
    "Listing platforms for migrated Tokopedia sellers. Requires a status other than ALL; both values select products listed on both platforms.",
    s.stringEnum("Listing platform.", ["TOKOPEDIA", "TIKTOK_SHOP"]),
  ),
  audit_status: s.array(
    "TikTok Shop audit statuses of base versions or post-live edits.",
    s.stringEnum("Audit status.", ["AUDITING", "FAILED", "APPROVED"]),
  ),
  sns_filter: s.stringEnum("Subscribe and Save eligibility or configuration filter.", ["CONFIGURED", "ELIGIBLE"]),
  return_draft_version: s.boolean(
    "Return only draft versions. Supported with ALL, DRAFT, ACTIVATE, SELLER_DEACTIVATED or PLATFORM_DEACTIVATED status.",
  ),
  locale,
  include_live_quick_products: s.boolean("Include LIVE_QUICK products alongside normal products. Defaults to false."),
};
const orderFilters = {
  order_status: s.stringEnum("Filter by order status.", [
    "UNPAID",
    "ON_HOLD",
    "AWAITING_SHIPMENT",
    "PARTIALLY_SHIPPING",
    "AWAITING_COLLECTION",
    "IN_TRANSIT",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
  ]),
  create_time_ge: s.integer("Inclusive creation time lower bound, in Unix seconds."),
  create_time_lt: s.integer("Exclusive creation time upper bound, in Unix seconds."),
  update_time_ge: s.integer(
    "Inclusive update time lower bound, in Unix seconds. Ongoing refreshes may return newer updates.",
  ),
  update_time_lt: s.integer(
    "Exclusive update time upper bound, in Unix seconds. Ongoing refreshes may return newer updates.",
  ),
  shipping_type: s.stringEnum("Delivery method; in-store pickup is available only in SEA markets.", [
    "TIKTOK",
    "SELLER",
    "TIKTOK_DIGITAL",
    "IN-STORE PICKUP",
  ]),
  buyer_user_id: s.nonEmptyString("Filter by buyer user ID."),
  is_buyer_request_cancel: s.boolean("Filter by whether the buyer requested cancellation."),
  warehouse_ids: s.array("Pickup or sales warehouse IDs; requires multi-warehouse support.", id, {
    maxItems: 100,
  }),
};

export const actions: ProviderActionDefinition[] = [
  defineProviderAction("tiktok_shop", {
    name: "list_authorized_shops",
    operationType: "read",
    description:
      "List the seller's authorized TikTok Shop stores and their shop ciphers for subsequent product and order calls.",
    requiredScopes: ["seller.authorization.info"],
    providerPermissions: ["seller.authorization.info"],
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.looseObject(
      "Authorized shops.",
      {
        shops: s.array(
          "Shops authorized for this app.",
          s.looseObject("Authorized shop details.", {
            id,
            name: s.string("Shop name."),
            cipher: shop,
            region: s.string("Shop market code."),
            seller_type: s.string("Seller type."),
            code: s.string("Shop code."),
          }),
        ),
      },
      { required: ["shops"] },
    ),
  }),
  defineProviderAction("tiktok_shop", {
    name: "search_products",
    operationType: "read",
    description:
      "Search TikTok Shop products using API 202502, with status, SKU, time, audit and listing filters. Use get_product for complete details.",
    requiredScopes: ["seller.product.basic"],
    providerPermissions: ["seller.product.basic"],
    inputSchema: s.object(
      "Product search and pagination.",
      { shop_cipher: shop, page_size: pageSize, page_token: pageToken, ...productFilters },
      { required: ["shop_cipher"] },
    ),
    outputSchema: s.looseObject(
      "Product search results.",
      { products: s.array("Matching products.", product), ...pagination },
      { required: ["products"] },
    ),
  }),
  defineProviderAction("tiktok_shop", {
    name: "get_product",
    operationType: "read",
    description:
      "Get a TikTok Shop product, including SKU inventory, prices and audit details. Select either the draft or under-review version when needed.",
    requiredScopes: ["seller.product.basic"],
    providerPermissions: ["seller.product.basic"],
    inputSchema: s.object(
      "Product and version to retrieve.",
      {
        shop_cipher: shop,
        product_id: id,
        locale,
        return_under_review_version: s.boolean(
          "Retrieve the version under review instead of the live snapshot. Mutually exclusive with return_draft_version.",
        ),
        return_draft_version: s.boolean(
          "Retrieve the draft version. Mutually exclusive with return_under_review_version; supported for DRAFT, ACTIVATE, SELLER_DEACTIVATED and PLATFORM_DEACTIVATED products.",
        ),
        query_options: s.array(
          "Additional product information to include.",
          s.stringEnum("Product query option.", ["GET_PRODUCT_DETAIL_URL"]),
        ),
      },
      {
        required: ["shop_cipher", "product_id"],
        not: { required: ["return_under_review_version", "return_draft_version"] },
      },
    ),
    outputSchema: s.requiredObject("Product details.", { product }),
  }),
  defineProviderAction("tiktok_shop", {
    name: "search_orders",
    operationType: "read",
    description:
      "Search TikTok Shop orders by creation or update time, status, buyer and warehouse, with cursor pagination.",
    requiredScopes: ["seller.order.info"],
    providerPermissions: ["seller.order.info"],
    inputSchema: s.object(
      "Order search and pagination.",
      {
        shop_cipher: shop,
        page_size: pageSize,
        page_token: pageToken,
        sort_order: s.stringEnum("Sort direction. Defaults to DESC.", ["ASC", "DESC"]),
        sort_field: s.stringEnum("Sort field. Defaults to create_time.", ["create_time", "update_time"]),
        ...orderFilters,
      },
      { required: ["shop_cipher"] },
    ),
    outputSchema: s.looseObject(
      "Order search results.",
      { orders: s.array("Matching orders.", order), ...pagination },
      { required: ["orders"] },
    ),
  }),
  defineProviderAction("tiktok_shop", {
    name: "get_orders",
    operationType: "read",
    description:
      "Get details of up to 50 TikTok Shop orders using API 202507, including payment, items and fulfillment information.",
    requiredScopes: ["seller.order.info"],
    providerPermissions: ["seller.order.info"],
    inputSchema: s.requiredObject("Orders to retrieve from one shop.", {
      shop_cipher: shop,
      ids: s.array("Order IDs to retrieve.", id, { minItems: 1, maxItems: 50 }),
    }),
    outputSchema: s.looseObject(
      "Order details.",
      { orders: s.array("Requested orders.", order) },
      { required: ["orders"] },
    ),
  }),
];
