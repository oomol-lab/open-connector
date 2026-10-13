import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { contentActions } from "./content-actions.ts";
import { operationActions } from "./operation-actions.ts";
const gidSchema = s.nonEmptyString("A Shopify GraphQL global ID.");
const cursorSchema = s.nonEmptyString("A Shopify GraphQL pagination cursor.");
const querySchema = s.nonEmptyString("A Shopify Admin API search query string.");
const firstSchema = s.integer("The first number of records to return.", {
  minimum: 1,
  maximum: 250,
});
const firstWithDefaultSchema = s.withDefault(firstSchema, 50);
const rawObjectSchema = s.looseObject("The raw object returned by Shopify Admin GraphQL.");
const pageInfoSchema = s.requiredObject("Shopify GraphQL pagination metadata.", {
  hasNextPage: s.boolean("Whether another page exists after this page."),
  hasPreviousPage: s.boolean("Whether another page exists before this page."),
  startCursor: s.nullable(cursorSchema),
  endCursor: s.nullable(cursorSchema),
});
const shopSchema = s.requiredObject("A normalized Shopify shop.", {
  id: gidSchema,
  name: s.string("The shop display name."),
  myshopifyDomain: s.string("The canonical myshopify.com domain for the shop."),
  primaryDomainUrl: s.nullable(s.url("The shop primary domain URL when returned by Shopify.")),
  primaryDomainHost: s.nullableString("The shop primary domain host when returned by Shopify."),
  raw: rawObjectSchema,
});
const productSummarySchema = s.requiredObject("A normalized Shopify product summary.", {
  id: gidSchema,
  title: s.string("The product title."),
  handle: s.nullableString("The product handle when returned by Shopify."),
  status: s.nullableString("The product status when returned by Shopify."),
  vendor: s.nullableString("The product vendor when returned by Shopify."),
  productType: s.nullableString("The product type when returned by Shopify."),
  createdAt: s.nullableString("The product creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The product update timestamp when returned by Shopify."),
  onlineStoreUrl: s.nullable(s.url("The online store product URL when returned by Shopify.")),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const productDetailSchema = s.requiredObject("A normalized Shopify product detail.", {
  id: gidSchema,
  title: s.string("The product title."),
  handle: s.nullableString("The product handle when returned by Shopify."),
  status: s.nullableString("The product status when returned by Shopify."),
  vendor: s.nullableString("The product vendor when returned by Shopify."),
  productType: s.nullableString("The product type when returned by Shopify."),
  descriptionHtml: s.nullableString("The product HTML description when returned by Shopify."),
  createdAt: s.nullableString("The product creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The product update timestamp when returned by Shopify."),
  onlineStoreUrl: s.nullable(s.url("The online store product URL when returned by Shopify.")),
  raw: rawObjectSchema,
});
const variantSchema = s.requiredObject("A normalized Shopify product variant.", {
  id: gidSchema,
  title: s.string("The variant title."),
  sku: s.nullableString("The variant SKU when returned by Shopify."),
  price: s.nullableString("The variant price as a decimal string when returned by Shopify."),
  inventoryQuantity: s.nullable(s.integer("The tracked inventory quantity when returned by Shopify.")),
  inventoryItemId: s.nullableString("The inventory item ID associated with the variant when returned by Shopify."),
  productId: s.nullableString("The parent product ID when returned by Shopify."),
  productTitle: s.nullableString("The parent product title when returned by Shopify."),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const orderSchema = s.requiredObject("A normalized Shopify order.", {
  id: gidSchema,
  name: s.string("The merchant-facing Shopify order name."),
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
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const orderDetailSchema = s.requiredObject("A normalized Shopify order detail.", {
  id: gidSchema,
  name: s.string("The merchant-facing Shopify order name."),
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
  raw: rawObjectSchema,
});
const customerSchema = s.requiredObject("A normalized Shopify customer.", {
  id: gidSchema,
  displayName: s.string("The customer display name."),
  firstName: s.nullableString("The customer first name when returned by Shopify."),
  lastName: s.nullableString("The customer last name when returned by Shopify."),
  email: s.nullableString("The customer email address when returned by Shopify."),
  phone: s.nullableString("The customer phone number when returned by Shopify."),
  state: s.nullableString("The customer account state when returned by Shopify."),
  tags: s.array("Customer tags returned by Shopify.", s.string("A customer tag.")),
  numberOfOrders: s.nullableString("The customer's lifetime order count encoded as an unsigned 64-bit integer string."),
  amountSpent: s.nullableString("The customer's lifetime amount spent when returned."),
  amountSpentCurrencyCode: s.nullableString(
    "The currency code for the customer's lifetime amount spent when returned.",
  ),
  createdAt: s.nullableString("The customer creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The customer update timestamp when returned by Shopify."),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const customerDetailSchema = s.requiredObject("A normalized Shopify customer detail.", {
  id: gidSchema,
  displayName: s.string("The customer display name."),
  firstName: s.nullableString("The customer first name when returned by Shopify."),
  lastName: s.nullableString("The customer last name when returned by Shopify."),
  email: s.nullableString("The customer email address when returned by Shopify."),
  phone: s.nullableString("The customer phone number when returned by Shopify."),
  state: s.nullableString("The customer account state when returned by Shopify."),
  tags: s.array("Customer tags returned by Shopify.", s.string("A customer tag.")),
  numberOfOrders: s.nullableString("The customer's lifetime order count encoded as an unsigned 64-bit integer string."),
  amountSpent: s.nullableString("The customer's lifetime amount spent when returned."),
  amountSpentCurrencyCode: s.nullableString(
    "The currency code for the customer's lifetime amount spent when returned.",
  ),
  createdAt: s.nullableString("The customer creation timestamp when returned by Shopify."),
  updatedAt: s.nullableString("The customer update timestamp when returned by Shopify."),
  raw: rawObjectSchema,
});
const inventoryItemSchema = s.requiredObject("A normalized Shopify inventory item.", {
  id: gidSchema,
  sku: s.nullableString("The inventory item SKU when returned by Shopify."),
  tracked: s.boolean("Whether Shopify tracks inventory levels for this item."),
  requiresShipping: s.boolean("Whether this inventory item requires shipping."),
  countryCodeOfOrigin: s.nullableString("The ISO country code of origin when returned by Shopify."),
  harmonizedSystemCode: s.nullableString("The harmonized system code when returned by Shopify."),
  createdAt: s.nullableString("The inventory item creation timestamp when returned."),
  updatedAt: s.nullableString("The inventory item update timestamp when returned."),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const inventoryItemDetailSchema = s.requiredObject("A normalized Shopify inventory item detail.", {
  id: gidSchema,
  sku: s.nullableString("The inventory item SKU when returned by Shopify."),
  tracked: s.boolean("Whether Shopify tracks inventory levels for this item."),
  requiresShipping: s.boolean("Whether this inventory item requires shipping."),
  countryCodeOfOrigin: s.nullableString("The ISO country code of origin when returned by Shopify."),
  harmonizedSystemCode: s.nullableString("The harmonized system code when returned by Shopify."),
  createdAt: s.nullableString("The inventory item creation timestamp when returned."),
  updatedAt: s.nullableString("The inventory item update timestamp when returned."),
  raw: rawObjectSchema,
});
const inventoryQuantitySchema = s.requiredObject("One Shopify inventory quantity state.", {
  name: s.string("The inventory quantity state name."),
  quantity: s.integer("The quantity recorded for this state."),
});
const inventoryLevelSchema = s.requiredObject("A normalized Shopify inventory level for one item at one location.", {
  id: gidSchema,
  isActive: s.boolean("Whether the inventory level is active."),
  inventoryItemId: gidSchema,
  inventoryItemSku: s.nullableString("The inventory item SKU when returned by Shopify."),
  locationId: gidSchema,
  locationName: s.string("The location name."),
  quantities: s.array("The requested inventory quantity states returned by Shopify.", inventoryQuantitySchema),
  raw: rawObjectSchema,
});
const locationSchema = s.requiredObject("A normalized Shopify location.", {
  id: gidSchema,
  name: s.string("The location name."),
  isActive: s.boolean("Whether the location is active."),
  fulfillsOnlineOrders: s.boolean("Whether this location can fulfill online orders."),
  address1: s.nullableString("The first address line when returned by Shopify."),
  city: s.nullableString("The location city when returned by Shopify."),
  province: s.nullableString("The location province or state when returned by Shopify."),
  country: s.nullableString("The location country when returned by Shopify."),
  zip: s.nullableString("The location postal code when returned by Shopify."),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const locationDetailSchema = s.requiredObject("A normalized Shopify location detail.", {
  id: gidSchema,
  name: s.string("The location name."),
  isActive: s.boolean("Whether the location is active."),
  fulfillsOnlineOrders: s.boolean("Whether this location can fulfill online orders."),
  address1: s.nullableString("The first address line when returned by Shopify."),
  city: s.nullableString("The location city when returned by Shopify."),
  province: s.nullableString("The location province or state when returned by Shopify."),
  country: s.nullableString("The location country when returned by Shopify."),
  zip: s.nullableString("The location postal code when returned by Shopify."),
  raw: rawObjectSchema,
});
const collectionSchema = s.requiredObject("A normalized Shopify collection.", {
  id: gidSchema,
  title: s.string("The collection title."),
  handle: s.string("The collection handle."),
  description: s.string("The plain-text collection description."),
  descriptionHtml: s.string("The HTML collection description."),
  updatedAt: s.nullableString("The collection update timestamp when returned by Shopify."),
  imageUrl: s.nullable(s.url("The collection image URL when returned by Shopify.")),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const collectionDetailSchema = s.requiredObject("A normalized Shopify collection detail.", {
  id: gidSchema,
  title: s.string("The collection title."),
  handle: s.string("The collection handle."),
  description: s.string("The plain-text collection description."),
  descriptionHtml: s.string("The HTML collection description."),
  updatedAt: s.nullableString("The collection update timestamp when returned by Shopify."),
  imageUrl: s.nullable(s.url("The collection image URL when returned by Shopify.")),
  raw: rawObjectSchema,
});
const productStatusSchema = s.stringEnum("The Shopify product status.", ["ACTIVE", "ARCHIVED", "DRAFT", "UNLISTED"]);
const metafieldInputSchema = s.object(
  "A Shopify metafield to create or update on the product.",
  {
    id: gidSchema,
    namespace: s.nonEmptyString("The metafield namespace."),
    key: s.nonEmptyString("The metafield key."),
    type: s.nonEmptyString("The Shopify metafield type."),
    value: s.string("The metafield value encoded as a string."),
  },
  { optional: ["id", "namespace", "key", "type", "value"] },
);
const seoInputSchema = s.object(
  "Search engine optimization fields for the product.",
  {
    title: s.string("The SEO title."),
    description: s.string("The SEO description."),
  },
  { optional: ["title", "description"] },
);
const productOptionValueInputSchema = s.object(
  "A value to define for a product option.",
  {
    name: s.nonEmptyString("The product option value name."),
    linkedMetafieldValue: s.string("The metafield value linked to this option value."),
  },
  { optional: ["name", "linkedMetafieldValue"] },
);
const linkedMetafieldCreateInputSchema = s.object(
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
const productOptionInputSchema = s.object(
  "A product option and its possible values.",
  {
    name: s.nonEmptyString("The product option name."),
    position: s.integer("The product option position."),
    linkedMetafield: linkedMetafieldCreateInputSchema,
    values: s.array("Values associated with this product option.", productOptionValueInputSchema, {
      minItems: 1,
    }),
  },
  { optional: ["name", "position", "linkedMetafield", "values"] },
);
const createMediaInputSchema = s.object(
  "A media object to add to a Shopify product.",
  {
    mediaContentType: s.stringEnum("The Shopify media content type.", ["EXTERNAL_VIDEO", "IMAGE", "MODEL_3D", "VIDEO"]),
    originalSource: s.nonEmptyString("The external source URL or Shopify staged upload URL for the media."),
    alt: s.string("Alternative text for the media."),
  },
  { optional: ["alt"] },
);
const productCreateInputSchema = s.object(
  "The typed Shopify ProductCreateInput fields supported by this action.",
  {
    category: gidSchema,
    claimOwnership: s.object(
      "Product feature ownership claimed by the connected Shopify app.",
      {
        bundles: s.boolean("Whether the app claims ownership of bundle configuration for this product."),
      },
      { optional: ["bundles"] },
    ),
    collectionsToJoin: s.array("Collection IDs to associate with the new product.", gidSchema),
    combinedListingRole: s.stringEnum("The product role in a combined listing.", ["CHILD", "PARENT"]),
    descriptionHtml: s.string("The product description with HTML tags."),
    giftCard: s.boolean("Whether the product is a gift card."),
    giftCardTemplateSuffix: s.string("The theme template suffix for a gift card product."),
    handle: s.nonEmptyString("The unique human-readable product URL handle."),
    metafields: s.array("Metafields to associate with the product.", metafieldInputSchema),
    productOptions: s.array("Product options and values for the initial product variant.", productOptionInputSchema, {
      maxItems: 3,
    }),
    productType: s.string("The merchant-defined product type."),
    requiresSellingPlan: s.boolean("Whether the product can only be purchased with a selling plan."),
    seo: seoInputSchema,
    status: productStatusSchema,
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
const productUpdateInputSchema = s.object(
  "The typed Shopify ProductUpdateInput fields supported by this action.",
  {
    id: gidSchema,
    category: gidSchema,
    collectionsToJoin: s.array("Collection IDs to associate with the product.", gidSchema),
    collectionsToLeave: s.array("Collection IDs to disassociate from the product.", gidSchema),
    deleteConflictingConstrainedMetafields: s.boolean(
      "Whether to delete metafields whose constraints conflict with the updated category.",
    ),
    descriptionHtml: s.string("The product description with HTML tags."),
    giftCardTemplateSuffix: s.string("The theme template suffix for a gift card product."),
    handle: s.nonEmptyString("The unique human-readable product URL handle."),
    metafields: s.array("Metafields to create or update on the product.", metafieldInputSchema),
    productType: s.string("The merchant-defined product type."),
    redirectNewHandle: s.boolean("Whether Shopify should redirect the previous handle to the new handle."),
    requiresSellingPlan: s.boolean("Whether the product can only be purchased with a selling plan."),
    seo: seoInputSchema,
    status: productStatusSchema,
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
const inventoryQuantityInputSchema = s.requiredObject(
  "An absolute inventory quantity to set for one item at one location.",
  {
    inventoryItemId: gidSchema,
    locationId: gidSchema,
    quantity: s.integer("The absolute quantity to set."),
    changeFromQuantity: s.nullable(
      s.integer("The expected current quantity for compare-and-swap, or null to explicitly skip the check."),
    ),
  },
);
const inventoryAdjustmentInputSchema = s.object(
  "An incremental inventory quantity change for one item at one location.",
  {
    inventoryItemId: gidSchema,
    locationId: gidSchema,
    delta: s.integer("The amount by which Shopify should change the inventory quantity."),
    changeFromQuantity: s.nullable(
      s.integer("The expected current quantity for compare-and-swap, or null to explicitly skip the check."),
    ),
    ledgerDocumentUri: s.nonEmptyString(
      "A non-Shopify URI identifying the exact inventory transaction or ledger entry.",
    ),
  },
  { optional: ["ledgerDocumentUri"] },
);
const inventoryAdjustmentReasonSchema = s.stringEnum("The Shopify reason for changing inventory quantities.", [
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
const inventoryAdjustQuantitiesInputSchema = s.object(
  "The typed Shopify inventoryAdjustQuantities mutation input.",
  {
    idempotencyKey: s.nonEmptyString(
      "A caller-stable idempotency key reused when retrying the same inventory adjustment.",
    ),
    name: s.nonEmptyString("The inventory quantity state to adjust."),
    reason: inventoryAdjustmentReasonSchema,
    referenceDocumentUri: s.nonEmptyString(
      "A URI identifying the business reason or source document for the adjustment group.",
    ),
    changes: s.array("Incremental inventory quantity changes to apply.", inventoryAdjustmentInputSchema, {
      minItems: 1,
    }),
  },
  { optional: ["referenceDocumentUri"] },
);
const inventoryChangeSchema = s.requiredObject("A normalized inventory quantity change.", {
  name: s.string("The inventory quantity state that changed."),
  delta: s.integer("The amount by which the inventory quantity changed."),
  quantityAfterChange: s.nullable(s.integer("The resulting quantity after the change when returned by Shopify.")),
  raw: rawObjectSchema,
});
const inventoryAdjustmentGroupSchema = s.requiredObject("A normalized Shopify inventory adjustment group.", {
  id: gidSchema,
  createdAt: s.string("The timestamp when Shopify created the adjustment group."),
  reason: s.string("The reason for the inventory changes."),
  referenceDocumentUri: s.nullableString("The audit trail reference URI when returned by Shopify."),
  changes: s.array("Inventory changes made by the operation.", inventoryChangeSchema),
  raw: rawObjectSchema,
});
const fulfillmentOrderLineItemInputSchema = s.requiredObject("A fulfillment order line item and quantity to fulfill.", {
  id: gidSchema,
  quantity: s.positiveInteger("The quantity of this fulfillment order line item to fulfill."),
});
const fulfillmentOrderInputSchema = s.object(
  "A fulfillment order and the optional subset of its line items to fulfill.",
  {
    fulfillmentOrderId: gidSchema,
    fulfillmentOrderLineItems: s.array(
      "The fulfillment order line items to fulfill; omit this field to fulfill all line items.",
      fulfillmentOrderLineItemInputSchema,
      { minItems: 1, maxItems: 512 },
    ),
  },
  { optional: ["fulfillmentOrderLineItems"] },
);
const fulfillmentOrderLineItemSchema = s.requiredObject("A normalized Shopify fulfillment order line item.", {
  id: gidSchema,
  totalQuantity: s.integer("The total quantity included in the fulfillment order."),
  remainingQuantity: s.integer("The quantity that remains to be fulfilled."),
  inventoryItemId: s.nullableString("The inventory item ID associated with the line item when returned by Shopify."),
  sku: s.nullableString("The variant SKU when returned by Shopify."),
  productTitle: s.string("The product title."),
  variantTitle: s.nullableString("The variant title when returned by Shopify."),
  requiresShipping: s.boolean("Whether the line item requires physical shipping."),
  raw: rawObjectSchema,
});
const fulfillmentOrderSupportedActionSchema = s.requiredObject(
  "An action supported by the fulfillment order in its current state.",
  {
    action: s.string("The Shopify fulfillment order action."),
    externalUrl: s.nullable(s.url("The external URL for an EXTERNAL action when returned by Shopify.")),
  },
);
const fulfillmentOrderSchema = s.requiredObject("A normalized Shopify fulfillment order.", {
  id: gidSchema,
  orderId: gidSchema,
  orderName: s.string("The merchant-facing order name."),
  status: s.string("The fulfillment order status."),
  requestStatus: s.string("The fulfillment request status."),
  assignedLocationId: s.nullableString("The assigned Shopify location ID when returned by Shopify."),
  assignedLocationName: s.string("The assigned fulfillment location name."),
  supportedActions: s.array(
    "Actions currently supported by the fulfillment order.",
    fulfillmentOrderSupportedActionSchema,
  ),
  lineItems: s.array("Fulfillment order line items returned by Shopify.", fulfillmentOrderLineItemSchema),
  lineItemsPageInfo: pageInfoSchema,
  updatedAt: s.string("The fulfillment order update timestamp."),
  cursor: s.nullable(cursorSchema),
  raw: rawObjectSchema,
});
const orderFulfillmentOrdersSchema = s.requiredObject("An order and its normalized fulfillment orders.", {
  id: gidSchema,
  name: s.string("The merchant-facing Shopify order name."),
  fulfillmentOrders: s.array("Fulfillment orders associated with the order.", fulfillmentOrderSchema),
  pageInfo: pageInfoSchema,
  raw: rawObjectSchema,
});
const fulfillmentOriginAddressInputSchema = s.object(
  "The full origin address used for fulfillment tax calculations.",
  {
    countryCode: s.nonEmptyString("The country code of the fulfillment location."),
    address1: s.string("The first street address line."),
    address2: s.string("The second street address line."),
    city: s.string("The city of the fulfillment location."),
    provinceCode: s.string("The province or state code of the fulfillment location."),
    zip: s.string("The postal code of the fulfillment location."),
  },
  { optional: ["address1", "address2", "city", "provinceCode", "zip"] },
);
const fulfillmentTrackingInputSchema = s.object(
  "Tracking information for the fulfillment.",
  {
    company: s.string("The tracking company name, using Shopify's exact capitalization."),
    number: s.nonEmptyString("The single tracking number."),
    numbers: s.array(
      "One or more tracking numbers for a multi-package fulfillment.",
      s.nonEmptyString("A tracking number."),
      { minItems: 1 },
    ),
    url: s.url("The URL for the single tracking number."),
    urls: s.array("Tracking URLs corresponding by position to the tracking numbers.", s.url("A tracking URL."), {
      minItems: 1,
    }),
  },
  { optional: ["company", "number", "numbers", "url", "urls"] },
);
const fulfillmentStatusSchema = s.stringEnum("The Shopify fulfillment status.", [
  "CANCELLED",
  "ERROR",
  "FAILURE",
  "SUCCESS",
  "OPEN",
  "PENDING",
]);
const fulfillmentSchema = s.requiredObject("A normalized Shopify fulfillment.", {
  id: gidSchema,
  name: s.string("The merchant-facing fulfillment name."),
  status: fulfillmentStatusSchema,
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
      raw: rawObjectSchema,
    }),
  ),
  raw: rawObjectSchema,
});
const bulkOperationStatusSchema = s.stringEnum("The Shopify bulk operation status.", [
  "CANCELED",
  "CANCELING",
  "COMPLETED",
  "CREATED",
  "EXPIRED",
  "FAILED",
  "RUNNING",
]);
const bulkOperationTypeSchema = s.stringEnum("The Shopify bulk operation type.", ["MUTATION", "QUERY"]);
const bulkOperationErrorCodeSchema = s.stringEnum("The Shopify bulk operation failure error code.", [
  "ACCESS_DENIED",
  "INTERNAL_SERVER_ERROR",
  "TIMEOUT",
]);
const bulkOperationSchema = s.requiredObject("A normalized Shopify bulk operation.", {
  id: gidSchema,
  status: bulkOperationStatusSchema,
  type: bulkOperationTypeSchema,
  createdAt: s.string("The bulk operation creation timestamp."),
  completedAt: s.nullableString("The successful completion timestamp when returned by Shopify."),
  errorCode: s.nullable(bulkOperationErrorCodeSchema),
  objectCount: s.string("The running object count encoded as an unsigned 64-bit integer string."),
  rootObjectCount: s.string("The running root object count encoded as an unsigned 64-bit integer string."),
  fileSize: s.nullableString("The result file size in bytes encoded as an unsigned 64-bit integer string."),
  url: s.nullable(s.url("The completed JSONL result URL when returned by Shopify.")),
  partialDataUrl: s.nullable(s.url("The partial JSONL result URL for a failed operation when returned by Shopify.")),
  query: s.string("The GraphQL query executed by the bulk operation."),
  raw: rawObjectSchema,
});
const downloadableBulkResultSchema = s.requiredObject("A Shopify bulk result stored in connector transit storage.", {
  fileId: s.string("The stored transit file ID."),
  downloadUrl: s.string("The transit file download URL."),
  name: s.string("The stored file name."),
  mimeType: s.string("The file MIME type."),
  sizeBytes: s.integer("The file size in bytes."),
});

const connectionInputSchema = s.object(
  "Shopify GraphQL connection arguments.",
  {
    first: firstWithDefaultSchema,
    after: cursorSchema,
    query: querySchema,
  },
  { optional: ["first", "after", "query"] },
);
const locationConnectionInputSchema = s.object(
  "Shopify location connection arguments.",
  {
    first: firstWithDefaultSchema,
    after: cursorSchema,
    query: querySchema,
    includeInactive: s.boolean("Whether to include deactivated locations."),
    includeLegacy: s.boolean("Whether to include legacy fulfillment service locations."),
  },
  { optional: ["first", "after", "query", "includeInactive", "includeLegacy"] },
);
export const shopifyActions: ActionDefinition[] = [
  ...contentActions,
  ...operationActions,
  defineProviderAction("shopify", {
    name: "get_shop",
    operationType: "read",
    description: "Retrieve basic shop information for the connected Shopify Admin token.",
    requiredScopes: [],
    inputSchema: s.requiredObject("No input is required to retrieve the connected Shopify shop.", {}),
    outputSchema: s.requiredObject("The normalized Shopify shop response.", {
      shop: shopSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_products",
    operationType: "read",
    description: "List Shopify products with optional search query and cursor pagination.",
    requiredScopes: [],
    inputSchema: connectionInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify product list response.", {
      products: s.array("Products returned by Shopify.", productSummarySchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_product",
    operationType: "read",
    description: "Retrieve one Shopify product by GraphQL global ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Shopify product lookup input.", {
      id: gidSchema,
    }),
    outputSchema: s.requiredObject("The normalized Shopify product response.", {
      product: s.nullable(productDetailSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_product_variants",
    operationType: "read",
    description: "List Shopify product variants with optional search query and cursor pagination.",
    requiredScopes: [],
    inputSchema: connectionInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify product variant list response.", {
      variants: s.array("Product variants returned by Shopify.", variantSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_order_fulfillment_orders",
    operationType: "read",
    description: "List fulfillment orders and fulfillable line items for one Shopify order.",
    requiredScopes: [],
    providerPermissions: [
      "read_assigned_fulfillment_orders",
      "read_merchant_managed_fulfillment_orders",
      "read_third_party_fulfillment_orders",
    ],
    inputSchema: s.object(
      "The Shopify order fulfillment order connection input.",
      {
        orderId: gidSchema,
        first: s.withDefault(firstSchema, 10),
        lineItemsFirst: s.withDefault(
          s.integer(
            "The number of line items per fulfillment order. Use get_fulfillment_order to fetch subsequent line-item pages.",
            { minimum: 1, maximum: 250 },
          ),
          10,
        ),
        after: cursorSchema,
        displayable: s.boolean("Whether to exclude fulfillment orders that Shopify normally hides from merchants."),
      },
      { optional: ["first", "lineItemsFirst", "after", "displayable"] },
    ),
    outputSchema: s.requiredObject("The Shopify order fulfillment order response.", {
      order: s.nullable(orderFulfillmentOrdersSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_fulfillment_order",
    operationType: "read",
    description: "Retrieve one Shopify fulfillment order with independently paginated line items.",
    requiredScopes: [],
    providerPermissions: [
      "read_assigned_fulfillment_orders",
      "read_merchant_managed_fulfillment_orders",
      "read_third_party_fulfillment_orders",
    ],
    inputSchema: s.object(
      "The Shopify fulfillment order lookup input.",
      {
        id: gidSchema,
        lineItemsFirst: firstWithDefaultSchema,
        lineItemsAfter: cursorSchema,
      },
      { optional: ["lineItemsFirst", "lineItemsAfter"] },
    ),
    outputSchema: s.requiredObject("The normalized Shopify fulfillment order response.", {
      fulfillmentOrder: s.nullable(fulfillmentOrderSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_orders",
    operationType: "read",
    description: "List Shopify orders with optional search query and cursor pagination.",
    requiredScopes: [],
    inputSchema: connectionInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify order list response.", {
      orders: s.array("Orders returned by Shopify.", orderSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_order",
    operationType: "read",
    description: "Retrieve one Shopify order by GraphQL global ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Shopify order lookup input.", {
      id: gidSchema,
    }),
    outputSchema: s.requiredObject("The normalized Shopify order response.", {
      order: s.nullable(orderDetailSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_customers",
    operationType: "read",
    description: "List Shopify customers with optional search query and cursor pagination.",
    requiredScopes: [],
    inputSchema: connectionInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify customer list response.", {
      customers: s.array("Customers returned by Shopify.", customerSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve one Shopify customer by GraphQL global ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Shopify customer lookup input.", {
      id: gidSchema,
    }),
    outputSchema: s.requiredObject("The normalized Shopify customer response.", {
      customer: s.nullable(customerDetailSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_inventory_items",
    operationType: "read",
    description: "List Shopify inventory items with optional search query and cursor pagination.",
    requiredScopes: [],
    inputSchema: connectionInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify inventory item list response.", {
      inventoryItems: s.array("Inventory items returned by Shopify.", inventoryItemSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_inventory_item",
    operationType: "read",
    description: "Retrieve one Shopify inventory item by GraphQL global ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Shopify inventory item lookup input.", {
      id: gidSchema,
    }),
    outputSchema: s.requiredObject("The normalized Shopify inventory item response.", {
      inventoryItem: s.nullable(inventoryItemDetailSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_inventory_quantities",
    operationType: "read",
    description: "Retrieve selected inventory quantity states for one Shopify inventory item at one location.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Shopify inventory level lookup input.",
      {
        inventoryItemId: gidSchema,
        locationId: gidSchema,
        names: s.withDefault(
          s.array(
            "Inventory quantity state names to retrieve.",
            s.nonEmptyString("An inventory quantity state name."),
            { minItems: 1 },
          ),
          ["available", "on_hand"],
        ),
        includeInactive: s.boolean("Whether Shopify should return the inventory level when it is inactive."),
      },
      { optional: ["names", "includeInactive"] },
    ),
    outputSchema: s.requiredObject("The normalized Shopify inventory level response.", {
      inventoryLevel: s.nullable(inventoryLevelSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_locations",
    operationType: "read",
    description: "List Shopify inventory locations with optional filters and cursor pagination.",
    requiredScopes: [],
    inputSchema: locationConnectionInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify location list response.", {
      locations: s.array("Locations returned by Shopify.", locationSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_location",
    operationType: "read",
    description: "Retrieve one Shopify location by GraphQL global ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Shopify location lookup input.", {
      id: gidSchema,
    }),
    outputSchema: s.requiredObject("The normalized Shopify location response.", {
      location: s.nullable(locationDetailSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "list_collections",
    operationType: "read",
    description: "List Shopify collections with optional search query and cursor pagination.",
    requiredScopes: [],
    inputSchema: connectionInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify collection list response.", {
      collections: s.array("Collections returned by Shopify.", collectionSchema),
      pageInfo: pageInfoSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_collection",
    operationType: "read",
    description: "Retrieve one Shopify collection by GraphQL global ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Shopify collection lookup input.", {
      id: gidSchema,
    }),
    outputSchema: s.requiredObject("The normalized Shopify collection response.", {
      collection: s.nullable(collectionDetailSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "create_product",
    operationType: "write",
    description: "Create one Shopify product with typed product attributes and optional media sources.",
    requiredScopes: [],
    providerPermissions: ["write_products"],
    inputSchema: s.object(
      "The typed Shopify productCreate mutation input.",
      {
        product: productCreateInputSchema,
        media: s.array("Media sources to add to the new product.", createMediaInputSchema),
      },
      { optional: ["media"] },
    ),
    outputSchema: s.requiredObject("The normalized created Shopify product.", {
      product: productDetailSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "update_product",
    operationType: "write",
    description: "Update one Shopify product by GraphQL global ID with typed attributes and optional new media.",
    requiredScopes: [],
    providerPermissions: ["write_products"],
    inputSchema: s.object(
      "The typed Shopify productUpdate mutation input.",
      {
        product: productUpdateInputSchema,
        media: s.array("New media sources to add to the product.", createMediaInputSchema),
      },
      { optional: ["media"] },
    ),
    outputSchema: s.requiredObject("The normalized updated Shopify product.", {
      product: productDetailSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "adjust_inventory_quantities",
    operationType: "write",
    description:
      "Apply incremental Shopify inventory quantity changes with required idempotency and explicit compare-and-swap values.",
    requiredScopes: [],
    providerPermissions: ["write_inventory"],
    inputSchema: inventoryAdjustQuantitiesInputSchema,
    outputSchema: s.requiredObject("The normalized Shopify inventory adjustment response.", {
      inventoryAdjustmentGroup: inventoryAdjustmentGroupSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "set_inventory_quantities",
    operationType: "write",
    description:
      "Set absolute Shopify inventory quantities with required idempotency and explicit compare-and-swap values.",
    requiredScopes: [],
    providerPermissions: ["write_inventory"],
    inputSchema: s.object(
      "The typed Shopify inventorySetQuantities mutation input.",
      {
        idempotencyKey: s.nonEmptyString(
          "A caller-stable idempotency key reused when retrying the same inventory write.",
        ),
        name: s.stringEnum("The inventory quantity state to set.", ["available", "on_hand"]),
        reason: inventoryAdjustmentReasonSchema,
        referenceDocumentUri: s.nonEmptyString(
          "A URI identifying the source document or system event for the inventory audit trail.",
        ),
        quantities: s.array("Absolute inventory quantities to set.", inventoryQuantityInputSchema, {
          minItems: 1,
        }),
      },
      { optional: ["referenceDocumentUri"] },
    ),
    outputSchema: s.requiredObject("The normalized Shopify inventory adjustment response.", {
      inventoryAdjustmentGroup: inventoryAdjustmentGroupSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "create_fulfillment",
    operationType: "write",
    description:
      "Create a Shopify fulfillment for one or more fulfillment orders with optional tracking and customer notification.",
    requiredScopes: [],
    providerPermissions: [
      "write_assigned_fulfillment_orders",
      "write_merchant_managed_fulfillment_orders",
      "write_third_party_fulfillment_orders",
    ],
    inputSchema: s.object(
      "The typed Shopify fulfillmentCreate mutation input.",
      {
        fulfillment: s.object(
          "The fulfillment orders, notification preference, origin address, and tracking information.",
          {
            lineItemsByFulfillmentOrder: s.array(
              "Fulfillment orders and optional line item subsets to fulfill.",
              fulfillmentOrderInputSchema,
              { minItems: 1 },
            ),
            notifyCustomer: s.boolean("Whether Shopify should notify the customer about the fulfillment."),
            originAddress: fulfillmentOriginAddressInputSchema,
            trackingInfo: fulfillmentTrackingInputSchema,
          },
          { optional: ["notifyCustomer", "originAddress", "trackingInfo"] },
        ),
        message: s.string("An optional message for the fulfillment request."),
      },
      { optional: ["message"] },
    ),
    outputSchema: s.requiredObject("The normalized created Shopify fulfillment.", {
      fulfillment: fulfillmentSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "submit_bulk_query",
    operationType: "write",
    description: "Submit a Shopify Admin GraphQL bulk query and return an operation ID for asynchronous polling.",
    requiredScopes: [],
    followUpActions: ["shopify.get_bulk_operation"],
    asyncLifecycle: { startActionId: "shopify.submit_bulk_query", statusActionId: "shopify.get_bulk_operation" },
    inputSchema: s.object(
      "The Shopify bulkOperationRunQuery mutation input.",
      {
        query: s.nonEmptyString("The bulk GraphQL query document containing at least one supported connection."),
        groupObjects: s.withDefault(
          s.boolean("Whether Shopify should group child objects under parents in JSONL; grouping is slower."),
          false,
        ),
      },
      { optional: ["groupObjects"] },
    ),
    outputSchema: s.requiredObject("The submitted Shopify bulk query operation.", {
      operation: bulkOperationSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "get_bulk_operation",
    operationType: "read",
    description: "Retrieve one Shopify bulk operation by ID for progress polling and result URL discovery.",
    requiredScopes: [],
    asyncLifecycle: { startActionId: "shopify.submit_bulk_query", statusActionId: "shopify.get_bulk_operation" },
    followUpActions: ["shopify.download_bulk_result"],
    inputSchema: s.requiredObject("The Shopify bulk operation lookup input.", {
      id: gidSchema,
    }),
    outputSchema: s.requiredObject("The Shopify bulk operation lookup response.", {
      operation: s.nullable(bulkOperationSchema),
    }),
  }),
  defineProviderAction("shopify", {
    name: "download_bulk_result",
    operationType: "read",
    description:
      "Download a completed or partial Shopify bulk JSONL result and upload it to connector transit storage.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Shopify bulk result download input.",
      {
        url: s.url("The expiring Shopify bulk operation URL or partialDataUrl."),
        fileName: s.nonEmptyString("An optional file name for the transit object."),
      },
      { optional: ["fileName"] },
    ),
    outputSchema: s.requiredObject("The downloaded Shopify bulk result.", {
      file: downloadableBulkResultSchema,
    }),
  }),
  defineProviderAction("shopify", {
    name: "execute_graphql",
    operationType: "write",
    description: "Execute a JSON-friendly Shopify Admin GraphQL query or mutation against the connected shop.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Shopify Admin GraphQL request payload.",
      {
        query: s.nonEmptyString("The GraphQL document to execute."),
        variables: s.record("GraphQL variables keyed by variable name.", s.unknown("A variable.")),
      },
      { optional: ["variables"] },
    ),
    outputSchema: s.object(
      "The raw Shopify Admin GraphQL response data and extensions.",
      {
        data: rawObjectSchema,
        extensions: rawObjectSchema,
      },
      { optional: ["extensions"] },
    ),
  }),
];
