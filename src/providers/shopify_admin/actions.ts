import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shopify_admin";

const gid = s.nonEmptyString("A Shopify GraphQL global ID.");
const cursor = s.nonEmptyString("A Shopify GraphQL pagination cursor.");
const query = s.nonEmptyString("A Shopify Admin API search query string.");
const first = s.integer({
  minimum: 1,
  maximum: 250,
  default: 50,
  description: "The first number of records to return.",
});
const rawObject = s.looseObject({}, { description: "The raw object returned by Shopify Admin GraphQL." });

const pageInfo = s.requiredObject("Shopify GraphQL pagination metadata.", {
  hasNextPage: s.boolean({ description: "Whether another page exists after this page." }),
  hasPreviousPage: s.boolean({ description: "Whether another page exists before this page." }),
  startCursor: s.nullable(cursor),
  endCursor: s.nullable(cursor),
});

const shop = s.requiredObject("A normalized Shopify shop.", {
  id: gid,
  name: s.string({ description: "The shop display name." }),
  myshopifyDomain: s.string({ description: "The canonical myshopify.com domain for the shop." }),
  primaryDomainUrl: s.nullable(s.url("The shop primary domain URL when returned by Shopify.")),
  primaryDomainHost: s.nullableString("The shop primary domain host when returned by Shopify."),
  raw: rawObject,
});

const productSummary = s.requiredObject("A normalized Shopify product summary.", {
  id: gid,
  title: s.string({ description: "The product title." }),
  handle: s.nullableString("The product handle when returned by Shopify."),
  status: s.nullableString("The product status when returned by Shopify."),
  vendor: s.nullableString("The product vendor when returned by Shopify."),
  productType: s.nullableString("The product type when returned by Shopify."),
  createdAt: s.nullableString("The product creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The product update timestamp when returned by Shopify."),
  onlineStoreUrl: s.nullable(s.url("The online store product URL when returned by Shopify.")),
  cursor: s.nullable(cursor),
  raw: rawObject,
});

const productDetail = s.requiredObject("A normalized Shopify product detail.", {
  id: gid,
  title: s.string({ description: "The product title." }),
  handle: s.nullableString("The product handle when returned by Shopify."),
  status: s.nullableString("The product status when returned by Shopify."),
  vendor: s.nullableString("The product vendor when returned by Shopify."),
  productType: s.nullableString("The product type when returned by Shopify."),
  descriptionHtml: s.nullableString("The product HTML description when returned by Shopify."),
  createdAt: s.nullableString("The product creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The product update timestamp when returned by Shopify."),
  onlineStoreUrl: s.nullable(s.url("The online store product URL when returned by Shopify.")),
  raw: rawObject,
});

const variant = s.requiredObject("A normalized Shopify product variant.", {
  id: gid,
  title: s.string({ description: "The variant title." }),
  sku: s.nullableString("The variant SKU when returned by Shopify."),
  price: s.nullableString("The variant price as a decimal string when returned by Shopify."),
  inventoryQuantity: s.nullable(s.integer({ description: "The tracked inventory quantity when returned by Shopify." })),
  inventoryItemId: s.nullableString("The inventory item ID associated with the variant when returned by Shopify."),
  productId: s.nullableString("The parent product ID when returned by Shopify."),
  productTitle: s.nullableString("The parent product title when returned by Shopify."),
  cursor: s.nullable(cursor),
  raw: rawObject,
});

const orderBase = {
  id: gid,
  name: s.string({ description: "The merchant-facing Shopify order name." }),
  email: s.nullableString("The order email address when returned by Shopify."),
  phone: s.nullableString("The order phone number when returned by Shopify."),
  displayFinancialStatus: s.nullableString("The display financial status returned by Shopify."),
  displayFulfillmentStatus: s.nullableString("The display fulfillment status returned by Shopify."),
  currencyCode: s.nullableString("The order currency code returned by Shopify."),
  totalAmount: s.nullableString("The current order total amount in shop currency when returned."),
  totalCurrencyCode: s.nullableString("The current order total currency code in shop currency when returned."),
  customerId: s.nullableString("The customer ID associated with the order when returned."),
  customerDisplayName: s.nullableString("The display name of the customer associated with the order when returned."),
  createdAt: s.nullableString("The order creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The order update timestamp when returned by Shopify."),
};
const order = s.requiredObject("A normalized Shopify order.", {
  ...orderBase,
  cursor: s.nullable(cursor),
  raw: rawObject,
});
const orderDetail = s.requiredObject("A normalized Shopify order detail.", {
  ...orderBase,
  raw: rawObject,
});

const customerBase = {
  id: gid,
  displayName: s.string({ description: "The customer display name." }),
  firstName: s.nullableString("The customer first name when returned by Shopify."),
  lastName: s.nullableString("The customer last name when returned by Shopify."),
  email: s.nullableString("The customer email address when returned by Shopify."),
  phone: s.nullableString("The customer phone number when returned by Shopify."),
  state: s.nullableString("The customer account state when returned by Shopify."),
  tags: s.stringArray("Customer tags returned by Shopify.", { itemDescription: "A customer tag." }),
  numberOfOrders: s.nullableString("The customer's lifetime order count encoded as an unsigned 64-bit integer string."),
  amountSpent: s.nullableString("The customer's lifetime amount spent when returned."),
  amountSpentCurrencyCode: s.nullableString(
    "The currency code for the customer's lifetime amount spent when returned.",
  ),
  createdAt: s.nullableString("The customer creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The customer update timestamp when returned by Shopify."),
};
const customer = s.requiredObject("A normalized Shopify customer.", {
  ...customerBase,
  cursor: s.nullable(cursor),
  raw: rawObject,
});
const customerDetail = s.requiredObject("A normalized Shopify customer detail.", {
  ...customerBase,
  raw: rawObject,
});

const inventoryItemBase = {
  id: gid,
  sku: s.nullableString("The inventory item SKU when returned by Shopify."),
  tracked: s.boolean({ description: "Whether Shopify tracks inventory levels for this item." }),
  requiresShipping: s.boolean({ description: "Whether this inventory item requires shipping." }),
  countryCodeOfOrigin: s.nullableString("The ISO country code of origin when returned by Shopify."),
  harmonizedSystemCode: s.nullableString("The harmonized system code when returned by Shopify."),
  createdAt: s.nullableString("The inventory item creation timestamp when returned."),
  updatedAt: s.nullableString("The inventory item update timestamp when returned."),
};
const inventoryItem = s.requiredObject("A normalized Shopify inventory item.", {
  ...inventoryItemBase,
  cursor: s.nullable(cursor),
  raw: rawObject,
});
const inventoryItemDetail = s.requiredObject("A normalized Shopify inventory item detail.", {
  ...inventoryItemBase,
  raw: rawObject,
});

const locationBase = {
  id: gid,
  name: s.string({ description: "The location name." }),
  isActive: s.boolean({ description: "Whether the location is active." }),
  fulfillsOnlineOrders: s.boolean({ description: "Whether this location can fulfill online orders." }),
  address1: s.nullableString("The first address line when returned by Shopify."),
  city: s.nullableString("The location city when returned by Shopify."),
  province: s.nullableString("The location province or state when returned by Shopify."),
  country: s.nullableString("The location country when returned by Shopify."),
  zip: s.nullableString("The location postal code when returned by Shopify."),
};
const location = s.requiredObject("A normalized Shopify location.", {
  ...locationBase,
  cursor: s.nullable(cursor),
  raw: rawObject,
});
const locationDetail = s.requiredObject("A normalized Shopify location detail.", {
  ...locationBase,
  raw: rawObject,
});

const collectionBase = {
  id: gid,
  title: s.string({ description: "The collection title." }),
  handle: s.string({ description: "The collection handle." }),
  description: s.string({ description: "The plain-text collection description." }),
  descriptionHtml: s.string({ description: "The HTML collection description." }),
  updatedAt: s.nullableString("The collection update timestamp when returned by Shopify."),
  imageUrl: s.nullable(s.url("The collection image URL when returned by Shopify.")),
};
const collection = s.requiredObject("A normalized Shopify collection.", {
  ...collectionBase,
  cursor: s.nullable(cursor),
  raw: rawObject,
});
const collectionDetail = s.requiredObject("A normalized Shopify collection detail.", {
  ...collectionBase,
  raw: rawObject,
});

const inventoryQuantity = s.requiredObject("One Shopify inventory quantity state.", {
  name: s.string("The inventory quantity state name."),
  quantity: s.integer("The quantity recorded for this state."),
});

const inventoryLevel = s.requiredObject("A normalized Shopify inventory level for one item at one location.", {
  id: gid,
  isActive: s.boolean("Whether the inventory level is active."),
  inventoryItemId: gid,
  inventoryItemSku: s.nullableString("The inventory item SKU when returned by Shopify."),
  locationId: gid,
  locationName: s.string("The location name."),
  quantities: s.array("The requested inventory quantity states returned by Shopify.", inventoryQuantity),
  raw: rawObject,
});

const productStatus = s.stringEnum("The Shopify product status.", ["ACTIVE", "ARCHIVED", "DRAFT", "UNLISTED"]);

const metafieldInput = s.object(
  "A Shopify metafield to create or update on the product.",
  {
    id: gid,
    namespace: s.nonEmptyString("The metafield namespace."),
    key: s.nonEmptyString("The metafield key."),
    type: s.nonEmptyString("The Shopify metafield type."),
    value: s.string("The metafield value encoded as a string."),
  },
  { optional: ["id", "namespace", "key", "type", "value"] },
);

const seoInput = s.object(
  "Search engine optimization fields for the product.",
  {
    title: s.string("The SEO title."),
    description: s.string("The SEO description."),
  },
  { optional: ["title", "description"] },
);

const productOptionValueInput = s.object(
  "A value to define for a product option.",
  {
    name: s.nonEmptyString("The product option value name."),
    linkedMetafieldValue: s.string("The metafield value linked to this option value."),
  },
  { optional: ["name", "linkedMetafieldValue"] },
);

const linkedMetafieldCreateInput = s.object(
  "A metafield definition linked to a product option.",
  {
    namespace: s.nonEmptyString("The namespace of the linked metafield definition."),
    key: s.nonEmptyString("The key of the linked metafield definition."),
    values: s.array(
      "The linked metafield values used to populate the product option.",
      s.string("A linked metafield value."),
    ),
  },
  { optional: ["values"] },
);

const productOptionInput = s.object(
  "A product option and its possible values.",
  {
    name: s.nonEmptyString("The product option name."),
    position: s.integer("The product option position."),
    linkedMetafield: linkedMetafieldCreateInput,
    values: s.array("Values associated with this product option.", productOptionValueInput, { minItems: 1 }),
  },
  { optional: ["name", "position", "linkedMetafield", "values"] },
);

const createMediaInput = s.object(
  "A media object to add to a Shopify product.",
  {
    mediaContentType: s.stringEnum("The Shopify media content type.", ["EXTERNAL_VIDEO", "IMAGE", "MODEL_3D", "VIDEO"]),
    originalSource: s.nonEmptyString("The external source URL or Shopify staged upload URL for the media."),
    alt: s.string("Alternative text for the media."),
  },
  { optional: ["alt"] },
);

const productCreateInput = s.object(
  "The typed Shopify ProductCreateInput fields supported by this action.",
  {
    category: gid,
    claimOwnership: s.object(
      "Product feature ownership claimed by the connected Shopify app.",
      {
        bundles: s.boolean("Whether the app claims ownership of bundle configuration for this product."),
      },
      { optional: ["bundles"] },
    ),
    collectionsToJoin: s.array("Collection IDs to associate with the new product.", gid),
    combinedListingRole: s.stringEnum("The product role in a combined listing.", ["CHILD", "PARENT"]),
    descriptionHtml: s.string("The product description with HTML tags."),
    giftCard: s.boolean("Whether the product is a gift card."),
    giftCardTemplateSuffix: s.string("The theme template suffix for a gift card product."),
    handle: s.nonEmptyString("The unique human-readable product URL handle."),
    metafields: s.array("Metafields to associate with the product.", metafieldInput),
    productOptions: s.array("Product options and values for the initial product variant.", productOptionInput, {
      maxItems: 3,
    }),
    productType: s.string("The merchant-defined product type."),
    requiresSellingPlan: s.boolean("Whether the product can only be purchased with a selling plan."),
    seo: seoInput,
    status: productStatus,
    tags: s.array("Searchable product tags.", s.string("A product tag.")),
    templateSuffix: s.string("The theme template suffix for the product."),
    title: s.string("The product title displayed to customers."),
    vendor: s.string("The product vendor name."),
  },
  {
    optional: [
      "category",
      "claimOwnership",
      "collectionsToJoin",
      "combinedListingRole",
      "descriptionHtml",
      "giftCard",
      "giftCardTemplateSuffix",
      "handle",
      "metafields",
      "productOptions",
      "productType",
      "requiresSellingPlan",
      "seo",
      "status",
      "tags",
      "templateSuffix",
      "title",
      "vendor",
    ],
  },
);

const productUpdateInput = s.object(
  "The typed Shopify ProductUpdateInput fields supported by this action.",
  {
    id: gid,
    category: gid,
    collectionsToJoin: s.array("Collection IDs to associate with the product.", gid),
    collectionsToLeave: s.array("Collection IDs to disassociate from the product.", gid),
    deleteConflictingConstrainedMetafields: s.boolean(
      "Whether to delete metafields whose constraints conflict with the updated category.",
    ),
    descriptionHtml: s.string("The product description with HTML tags."),
    giftCardTemplateSuffix: s.string("The theme template suffix for a gift card product."),
    handle: s.nonEmptyString("The unique human-readable product URL handle."),
    metafields: s.array("Metafields to create or update on the product.", metafieldInput),
    productType: s.string("The merchant-defined product type."),
    redirectNewHandle: s.boolean("Whether Shopify should redirect the previous handle to the new handle."),
    requiresSellingPlan: s.boolean("Whether the product can only be purchased with a selling plan."),
    seo: seoInput,
    status: productStatus,
    tags: s.array("The complete replacement list of searchable product tags.", s.string("A product tag.")),
    templateSuffix: s.string("The theme template suffix for the product."),
    title: s.string("The product title displayed to customers."),
    vendor: s.string("The product vendor name."),
  },
  {
    optional: [
      "category",
      "collectionsToJoin",
      "collectionsToLeave",
      "deleteConflictingConstrainedMetafields",
      "descriptionHtml",
      "giftCardTemplateSuffix",
      "handle",
      "metafields",
      "productType",
      "redirectNewHandle",
      "requiresSellingPlan",
      "seo",
      "status",
      "tags",
      "templateSuffix",
      "title",
      "vendor",
    ],
  },
);

const inventoryQuantityInput = s.requiredObject("An absolute inventory quantity to set for one item at one location.", {
  inventoryItemId: gid,
  locationId: gid,
  quantity: s.integer("The absolute quantity to set."),
  changeFromQuantity: s.nullable(
    s.integer("The expected current quantity for compare-and-swap, or null to explicitly skip the check."),
  ),
});

const inventoryAdjustmentInput = s.object(
  "An incremental inventory quantity change for one item at one location.",
  {
    inventoryItemId: gid,
    locationId: gid,
    delta: s.integer("The amount by which Shopify should change the inventory quantity."),
    changeFromQuantity: s.nullable(
      s.integer("The expected current quantity for compare-and-swap, or null to explicitly skip the check."),
    ),
    ledgerDocumentUri: s.nonEmptyString(
      "A non-Shopify URI identifying the exact inventory transaction or ledger entry.",
    ),
  },
  { required: ["inventoryItemId", "locationId", "delta", "changeFromQuantity"] },
);

const inventoryAdjustmentReason = s.stringEnum("The Shopify reason for changing inventory quantities.", [
  "correction",
  "cycle_count_available",
  "damaged",
  "movement_created",
  "movement_updated",
  "movement_received",
  "movement_canceled",
  "other",
  "promotion",
  "quality_control",
  "received",
  "reservation_created",
  "reservation_deleted",
  "reservation_updated",
  "restock",
  "safety_stock",
  "shrinkage",
]);

const inventoryAdjustQuantitiesInput: JsonSchema = {
  ...s.actionInput(
    {
      idempotencyKey: s.nonEmptyString(
        "A caller-stable idempotency key reused when retrying the same inventory adjustment.",
      ),
      name: s.nonEmptyString("The inventory quantity state to adjust."),
      reason: inventoryAdjustmentReason,
      referenceDocumentUri: s.nonEmptyString(
        "A URI identifying the business reason or source document for the adjustment group.",
      ),
      changes: s.array("Incremental inventory quantity changes to apply.", inventoryAdjustmentInput, {
        minItems: 1,
      }),
    },
    ["idempotencyKey", "name", "reason", "changes"],
    "The typed Shopify inventoryAdjustQuantities mutation input.",
  ),
  allOf: [
    {
      if: { properties: { name: { const: "available" } }, required: ["name"] },
      then: {
        properties: {
          changes: {
            items: { not: { required: ["ledgerDocumentUri"] } },
          },
        },
      },
      else: {
        properties: {
          changes: {
            items: { required: ["ledgerDocumentUri"] },
          },
        },
      },
    },
  ],
};

const inventoryChange = s.requiredObject("A normalized inventory quantity change.", {
  name: s.string("The inventory quantity state that changed."),
  delta: s.integer("The amount by which the inventory quantity changed."),
  quantityAfterChange: s.nullable(s.integer("The resulting quantity after the change when returned by Shopify.")),
  raw: rawObject,
});

const inventoryAdjustmentGroup = s.requiredObject("A normalized Shopify inventory adjustment group.", {
  id: gid,
  createdAt: s.string("The timestamp when Shopify created the adjustment group."),
  reason: s.string("The reason for the inventory changes."),
  referenceDocumentUri: s.nullableString("The audit trail reference URI when returned by Shopify."),
  changes: s.array("Inventory changes made by the operation.", inventoryChange),
  raw: rawObject,
});

const fulfillmentOrderLineItemInput = s.requiredObject("A fulfillment order line item and quantity to fulfill.", {
  id: gid,
  quantity: s.positiveInteger("The quantity of this fulfillment order line item to fulfill."),
});

const fulfillmentOrderInput = s.object(
  "A fulfillment order and the optional subset of its line items to fulfill.",
  {
    fulfillmentOrderId: gid,
    fulfillmentOrderLineItems: s.array(
      "The fulfillment order line items to fulfill; omit this field to fulfill all line items.",
      fulfillmentOrderLineItemInput,
      { minItems: 1, maxItems: 512 },
    ),
  },
  { required: ["fulfillmentOrderId"] },
);

const fulfillmentOrderLineItem = s.requiredObject("A normalized Shopify fulfillment order line item.", {
  id: gid,
  totalQuantity: s.integer("The total quantity included in the fulfillment order."),
  remainingQuantity: s.integer("The quantity that remains to be fulfilled."),
  inventoryItemId: s.nullableString("The inventory item ID associated with the line item when returned by Shopify."),
  sku: s.nullableString("The variant SKU when returned by Shopify."),
  productTitle: s.string("The product title."),
  variantTitle: s.nullableString("The variant title when returned by Shopify."),
  requiresShipping: s.boolean("Whether the line item requires physical shipping."),
  raw: rawObject,
});

const fulfillmentOrderSupportedAction = s.requiredObject(
  "An action supported by the fulfillment order in its current state.",
  {
    action: s.string("The Shopify fulfillment order action."),
    externalUrl: s.nullable(s.url("The external URL for an EXTERNAL action when returned by Shopify.")),
  },
);

const fulfillmentOrder = s.requiredObject("A normalized Shopify fulfillment order.", {
  id: gid,
  orderId: gid,
  orderName: s.string("The merchant-facing order name."),
  status: s.string("The fulfillment order status."),
  requestStatus: s.string("The fulfillment request status."),
  assignedLocationId: s.nullableString("The assigned Shopify location ID when returned by Shopify."),
  assignedLocationName: s.string("The assigned fulfillment location name."),
  supportedActions: s.array("Actions currently supported by the fulfillment order.", fulfillmentOrderSupportedAction),
  lineItems: s.array("Fulfillment order line items returned by Shopify.", fulfillmentOrderLineItem),
  lineItemsPageInfo: pageInfo,
  updatedAt: s.string("The fulfillment order update timestamp."),
  cursor: s.nullable(cursor),
  raw: rawObject,
});

const orderFulfillmentOrders = s.requiredObject("An order and its normalized fulfillment orders.", {
  id: gid,
  name: s.string("The merchant-facing Shopify order name."),
  fulfillmentOrders: s.array("Fulfillment orders associated with the order.", fulfillmentOrder),
  pageInfo,
  raw: rawObject,
});

const fulfillmentOriginAddressInput = s.object(
  "The full origin address used for fulfillment tax calculations.",
  {
    countryCode: s.nonEmptyString("The country code of the fulfillment location."),
    address1: s.string("The first street address line."),
    address2: s.string("The second street address line."),
    city: s.string("The city of the fulfillment location."),
    provinceCode: s.string("The province or state code of the fulfillment location."),
    zip: s.string("The postal code of the fulfillment location."),
  },
  { required: ["countryCode"] },
);

const fulfillmentTrackingInput: JsonSchema = {
  ...s.object(
    "Tracking information for the fulfillment.",
    {
      company: s.string("The tracking company name, using Shopify's exact capitalization."),
      number: s.nonEmptyString("The single tracking number."),
      numbers: s.stringArray("One or more tracking numbers for a multi-package fulfillment.", {
        minItems: 1,
        itemDescription: "A tracking number.",
      }),
      url: s.url("The URL for the single tracking number."),
      urls: s.array("Tracking URLs corresponding by position to the tracking numbers.", s.url("A tracking URL."), {
        minItems: 1,
      }),
    },
    { optional: ["company", "number", "numbers", "url", "urls"] },
  ),
  allOf: [
    { not: { required: ["number", "numbers"] } },
    { not: { required: ["url", "urls"] } },
    { if: { required: ["url"] }, then: { required: ["number"] } },
    { if: { required: ["urls"] }, then: { required: ["numbers"] } },
  ],
};

const fulfillment = s.requiredObject("A normalized Shopify fulfillment.", {
  id: gid,
  name: s.string("The merchant-facing fulfillment name."),
  status: s.stringEnum("The Shopify fulfillment status.", [
    "CANCELLED",
    "ERROR",
    "FAILURE",
    "SUCCESS",
    "OPEN",
    "PENDING",
  ]),
  totalQuantity: s.integer("The total fulfilled line item quantity."),
  createdAt: s.string("The fulfillment creation timestamp."),
  orderId: s.string("The fulfilled order ID."),
  orderName: s.string("The merchant-facing fulfilled order name."),
  trackingInfo: s.array(
    "Tracking information returned for the fulfillment.",
    s.requiredObject("One normalized tracking record.", {
      company: s.nullableString("The tracking company when returned by Shopify."),
      number: s.nullableString("The tracking number when returned by Shopify."),
      url: s.nullable(s.url("The tracking URL when returned by Shopify.")),
      raw: rawObject,
    }),
  ),
  raw: rawObject,
});

const bulkOperation = s.requiredObject("A normalized Shopify bulk operation.", {
  id: gid,
  status: s.stringEnum("The Shopify bulk operation status.", [
    "CANCELED",
    "CANCELING",
    "COMPLETED",
    "CREATED",
    "EXPIRED",
    "FAILED",
    "RUNNING",
  ]),
  type: s.stringEnum("The Shopify bulk operation type.", ["MUTATION", "QUERY"]),
  createdAt: s.string("The bulk operation creation timestamp."),
  completedAt: s.nullableString("The successful completion timestamp when returned by Shopify."),
  errorCode: s.nullable(
    s.stringEnum("The Shopify bulk operation failure error code.", [
      "ACCESS_DENIED",
      "INTERNAL_SERVER_ERROR",
      "TIMEOUT",
    ]),
  ),
  objectCount: s.string("The running object count encoded as an unsigned 64-bit integer string."),
  rootObjectCount: s.string("The running root object count encoded as an unsigned 64-bit integer string."),
  fileSize: s.nullableString("The result file size in bytes encoded as an unsigned 64-bit integer string."),
  url: s.nullable(s.url("The completed JSONL result URL when returned by Shopify.")),
  partialDataUrl: s.nullable(s.url("The partial JSONL result URL for a failed operation when returned by Shopify.")),
  query: s.string("The GraphQL query executed by the bulk operation."),
  raw: rawObject,
});

const transitFileOutput = s.requiredObject("A file stored in local connector transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL for downloading the transit file."),
  sizeBytes: s.nonNegativeInteger("The transit file size in bytes."),
  name: s.nonEmptyString("The file name stored in transit storage."),
  mimeType: s.nonEmptyString("The MIME type stored in transit storage."),
});

const connectionInput = s.actionInput(
  {
    first,
    after: cursor,
    query,
  },
  [],
  "Shopify GraphQL connection arguments.",
);

const locationConnectionInput = s.actionInput(
  {
    first,
    after: cursor,
    query,
    includeInactive: s.boolean({ description: "Whether to include deactivated locations." }),
    includeLegacy: s.boolean({ description: "Whether to include legacy fulfillment service locations." }),
  },
  [],
  "Shopify location connection arguments.",
);

export type ShopifyAdminActionName =
  | "get_shop"
  | "list_products"
  | "get_product"
  | "list_product_variants"
  | "list_order_fulfillment_orders"
  | "get_fulfillment_order"
  | "list_orders"
  | "get_order"
  | "list_customers"
  | "get_customer"
  | "list_inventory_items"
  | "get_inventory_item"
  | "get_inventory_quantities"
  | "list_locations"
  | "get_location"
  | "list_collections"
  | "get_collection"
  | "create_product"
  | "update_product"
  | "adjust_inventory_quantities"
  | "set_inventory_quantities"
  | "create_fulfillment"
  | "submit_bulk_query"
  | "get_bulk_operation"
  | "download_bulk_result"
  | "execute_graphql";

export const shopifyAdminActions: ActionDefinition[] = [
  action(
    "get_shop",
    "Retrieve basic shop information for the connected Shopify Admin token.",
    s.actionInput({}, [], "No input is required to retrieve the connected Shopify shop."),
    s.actionOutput({ shop }, "The normalized Shopify shop response."),
  ),
  action(
    "list_products",
    "List Shopify products with optional search query and cursor pagination.",
    connectionInput,
    s.actionOutput(
      {
        products: s.array(productSummary, { description: "Products returned by Shopify." }),
        pageInfo,
      },
      "The normalized Shopify product list response.",
    ),
  ),
  action(
    "get_product",
    "Retrieve one Shopify product by GraphQL global ID.",
    s.actionInput({ id: gid }, ["id"], "The Shopify product lookup input."),
    s.actionOutput({ product: s.nullable(productDetail) }, "The normalized Shopify product response."),
  ),
  action(
    "list_product_variants",
    "List Shopify product variants with optional search query and cursor pagination.",
    connectionInput,
    s.actionOutput(
      {
        variants: s.array(variant, { description: "Product variants returned by Shopify." }),
        pageInfo,
      },
      "The normalized Shopify product variant list response.",
    ),
  ),
  action(
    "list_order_fulfillment_orders",
    "List fulfillment orders and fulfillable line items for one Shopify order.",
    s.actionInput(
      {
        orderId: gid,
        first,
        after: cursor,
        displayable: s.boolean("Whether to exclude fulfillment orders that Shopify normally hides from merchants."),
      },
      ["orderId"],
      "The Shopify order fulfillment order connection input.",
    ),
    s.actionOutput({ order: s.nullable(orderFulfillmentOrders) }, "The Shopify order fulfillment order response."),
    {
      providerPermissions: [
        "read_assigned_fulfillment_orders",
        "read_merchant_managed_fulfillment_orders",
        "read_third_party_fulfillment_orders",
      ],
    },
  ),
  action(
    "get_fulfillment_order",
    "Retrieve one Shopify fulfillment order with independently paginated line items.",
    s.actionInput(
      {
        id: gid,
        lineItemsFirst: first,
        lineItemsAfter: cursor,
      },
      ["id"],
      "The Shopify fulfillment order lookup input.",
    ),
    s.actionOutput(
      { fulfillmentOrder: s.nullable(fulfillmentOrder) },
      "The normalized Shopify fulfillment order response.",
    ),
    {
      providerPermissions: [
        "read_assigned_fulfillment_orders",
        "read_merchant_managed_fulfillment_orders",
        "read_third_party_fulfillment_orders",
      ],
    },
  ),
  action(
    "list_orders",
    "List Shopify orders with optional search query and cursor pagination.",
    connectionInput,
    s.actionOutput(
      {
        orders: s.array(order, { description: "Orders returned by Shopify." }),
        pageInfo,
      },
      "The normalized Shopify order list response.",
    ),
  ),
  action(
    "get_order",
    "Retrieve one Shopify order by GraphQL global ID.",
    s.actionInput({ id: gid }, ["id"], "The Shopify order lookup input."),
    s.actionOutput({ order: s.nullable(orderDetail) }, "The normalized Shopify order response."),
  ),
  action(
    "list_customers",
    "List Shopify customers with optional search query and cursor pagination.",
    connectionInput,
    s.actionOutput(
      {
        customers: s.array(customer, { description: "Customers returned by Shopify." }),
        pageInfo,
      },
      "The normalized Shopify customer list response.",
    ),
  ),
  action(
    "get_customer",
    "Retrieve one Shopify customer by GraphQL global ID.",
    s.actionInput({ id: gid }, ["id"], "The Shopify customer lookup input."),
    s.actionOutput({ customer: s.nullable(customerDetail) }, "The normalized Shopify customer response."),
  ),
  action(
    "list_inventory_items",
    "List Shopify inventory items with optional search query and cursor pagination.",
    connectionInput,
    s.actionOutput(
      {
        inventoryItems: s.array(inventoryItem, { description: "Inventory items returned by Shopify." }),
        pageInfo,
      },
      "The normalized Shopify inventory item list response.",
    ),
  ),
  action(
    "get_inventory_item",
    "Retrieve one Shopify inventory item by GraphQL global ID.",
    s.actionInput({ id: gid }, ["id"], "The Shopify inventory item lookup input."),
    s.actionOutput(
      { inventoryItem: s.nullable(inventoryItemDetail) },
      "The normalized Shopify inventory item response.",
    ),
  ),
  action(
    "get_inventory_quantities",
    "Retrieve selected inventory quantity states for one Shopify inventory item at one location.",
    s.actionInput(
      {
        inventoryItemId: gid,
        locationId: gid,
        names: s.stringArray("Inventory quantity state names to retrieve.", {
          minItems: 1,
          itemDescription: "An inventory quantity state name.",
          default: ["available", "on_hand"],
        }),
        includeInactive: s.boolean("Whether Shopify should return the inventory level when it is inactive."),
      },
      ["inventoryItemId", "locationId"],
      "The Shopify inventory level lookup input.",
    ),
    s.actionOutput({ inventoryLevel: s.nullable(inventoryLevel) }, "The normalized Shopify inventory level response."),
  ),
  action(
    "list_locations",
    "List Shopify inventory locations with optional filters and cursor pagination.",
    locationConnectionInput,
    s.actionOutput(
      {
        locations: s.array(location, { description: "Locations returned by Shopify." }),
        pageInfo,
      },
      "The normalized Shopify location list response.",
    ),
  ),
  action(
    "get_location",
    "Retrieve one Shopify location by GraphQL global ID.",
    s.actionInput({ id: gid }, ["id"], "The Shopify location lookup input."),
    s.actionOutput({ location: s.nullable(locationDetail) }, "The normalized Shopify location response."),
  ),
  action(
    "list_collections",
    "List Shopify collections with optional search query and cursor pagination.",
    connectionInput,
    s.actionOutput(
      {
        collections: s.array(collection, { description: "Collections returned by Shopify." }),
        pageInfo,
      },
      "The normalized Shopify collection list response.",
    ),
  ),
  action(
    "get_collection",
    "Retrieve one Shopify collection by GraphQL global ID.",
    s.actionInput({ id: gid }, ["id"], "The Shopify collection lookup input."),
    s.actionOutput({ collection: s.nullable(collectionDetail) }, "The normalized Shopify collection response."),
  ),
  action(
    "create_product",
    "Create one Shopify product with typed product attributes and optional media sources.",
    s.actionInput(
      {
        product: productCreateInput,
        media: s.array("Media sources to add to the new product.", createMediaInput),
      },
      ["product"],
      "The typed Shopify productCreate mutation input.",
    ),
    s.actionOutput({ product: productDetail }, "The normalized created Shopify product."),
    { providerPermissions: ["write_products"] },
  ),
  action(
    "update_product",
    "Update one Shopify product by GraphQL global ID with typed attributes and optional new media.",
    s.actionInput(
      {
        product: productUpdateInput,
        media: s.array("New media sources to add to the product.", createMediaInput),
      },
      ["product"],
      "The typed Shopify productUpdate mutation input.",
    ),
    s.actionOutput({ product: productDetail }, "The normalized updated Shopify product."),
    { providerPermissions: ["write_products"] },
  ),
  action(
    "adjust_inventory_quantities",
    "Apply incremental Shopify inventory quantity changes with required idempotency and explicit compare-and-swap values.",
    inventoryAdjustQuantitiesInput,
    s.actionOutput({ inventoryAdjustmentGroup }, "The normalized Shopify inventory adjustment response."),
    { providerPermissions: ["write_inventory"] },
  ),
  action(
    "set_inventory_quantities",
    "Set absolute Shopify inventory quantities with required idempotency and explicit compare-and-swap values.",
    s.actionInput(
      {
        idempotencyKey: s.nonEmptyString(
          "A caller-stable idempotency key reused when retrying the same inventory write.",
        ),
        name: s.stringEnum("The inventory quantity state to set.", ["available", "on_hand"]),
        reason: inventoryAdjustmentReason,
        referenceDocumentUri: s.nonEmptyString(
          "A URI identifying the source document or system event for the inventory audit trail.",
        ),
        quantities: s.array("Absolute inventory quantities to set.", inventoryQuantityInput, {
          minItems: 1,
        }),
      },
      ["idempotencyKey", "name", "reason", "quantities"],
      "The typed Shopify inventorySetQuantities mutation input.",
    ),
    s.actionOutput({ inventoryAdjustmentGroup }, "The normalized Shopify inventory adjustment response."),
    { providerPermissions: ["write_inventory"] },
  ),
  action(
    "create_fulfillment",
    "Create a Shopify fulfillment for one or more fulfillment orders with optional tracking and customer notification.",
    s.actionInput(
      {
        fulfillment: s.object(
          "The fulfillment orders, notification preference, origin address, and tracking information.",
          {
            lineItemsByFulfillmentOrder: s.array(
              "Fulfillment orders and optional line item subsets to fulfill.",
              fulfillmentOrderInput,
              { minItems: 1 },
            ),
            notifyCustomer: s.boolean("Whether Shopify should notify the customer about the fulfillment."),
            originAddress: fulfillmentOriginAddressInput,
            trackingInfo: fulfillmentTrackingInput,
          },
          { required: ["lineItemsByFulfillmentOrder"] },
        ),
        message: s.string("An optional message for the fulfillment request."),
      },
      ["fulfillment"],
      "The typed Shopify fulfillmentCreate mutation input.",
    ),
    s.actionOutput({ fulfillment }, "The normalized created Shopify fulfillment."),
    {
      providerPermissions: [
        "write_assigned_fulfillment_orders",
        "write_merchant_managed_fulfillment_orders",
        "write_third_party_fulfillment_orders",
      ],
    },
  ),
  action(
    "submit_bulk_query",
    "Submit a Shopify Admin GraphQL bulk query and return an operation ID for asynchronous polling.",
    s.actionInput(
      {
        query: s.nonEmptyString("The bulk GraphQL query document containing at least one supported connection."),
        groupObjects: s.boolean({
          default: false,
          description: "Whether Shopify should group child objects under parents in JSONL; grouping is slower.",
        }),
      },
      ["query"],
      "The Shopify bulkOperationRunQuery mutation input.",
    ),
    s.actionOutput({ operation: bulkOperation }, "The submitted Shopify bulk query operation."),
    {
      followUpActions: ["shopify_admin.get_bulk_operation"],
      asyncLifecycle: {
        startActionId: "shopify_admin.submit_bulk_query",
        statusActionId: "shopify_admin.get_bulk_operation",
      },
    },
  ),
  action(
    "get_bulk_operation",
    "Retrieve one Shopify bulk operation by ID for progress polling and result URL discovery.",
    s.actionInput({ id: gid }, ["id"], "The Shopify bulk operation lookup input."),
    s.actionOutput({ operation: s.nullable(bulkOperation) }, "The Shopify bulk operation lookup response."),
    {
      followUpActions: ["shopify_admin.download_bulk_result"],
      asyncLifecycle: {
        startActionId: "shopify_admin.submit_bulk_query",
        statusActionId: "shopify_admin.get_bulk_operation",
      },
    },
  ),
  action(
    "download_bulk_result",
    "Download a completed or partial Shopify bulk JSONL result into local connector transit storage.",
    s.actionInput(
      {
        url: s.url("The expiring Shopify bulk operation URL or partialDataUrl."),
        fileName: s.nonEmptyString("An optional file name for the transit object."),
      },
      ["url"],
      "The Shopify bulk result download input.",
    ),
    s.actionOutput({ file: transitFileOutput }, "The downloaded Shopify bulk result."),
  ),
  action(
    "execute_graphql",
    "Execute a JSON-friendly Shopify Admin GraphQL query or mutation against the connected shop.",
    s.actionInput(
      {
        query: s.nonEmptyString("The GraphQL document to execute."),
        variables: s.record(s.unknown("A variable."), {
          description: "GraphQL variables keyed by variable name.",
        }),
      },
      ["query"],
      "The Shopify Admin GraphQL request payload.",
    ),
    s.actionOutput(
      {
        data: rawObject,
        extensions: rawObject,
      },
      "The raw Shopify Admin GraphQL response data and extensions.",
      ["data"],
    ),
  ),
];

function action(
  name: ShopifyAdminActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  metadata: Partial<Pick<ActionDefinition, "providerPermissions" | "followUpActions" | "asyncLifecycle">> = {},
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
    ...metadata,
  });
}
