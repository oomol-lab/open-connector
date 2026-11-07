import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { ebayFulfillmentScope, ebayIdentityScope } from "./constants.ts";

const orderId = s.nonEmptyString("The eBay order ID returned by list_orders.");
const fulfillmentId = s.nonEmptyString("The shipping fulfillment ID returned by eBay.");
const fieldGroups = s.stringEnum("Include a breakdown of taxes and fees.", ["TAX_BREAKDOWN"]);
const lineItem = s.looseObject("An order line item and its quantity.", {
  lineItemId: s.string("The eBay order line item ID."),
  quantity: s.integer("The quantity in this package."),
});
const warnings = s.array("Warnings returned by eBay.", s.looseObject("An eBay warning.", {}));
const fulfillment = s.looseObject("An eBay shipping fulfillment.", {
  fulfillmentId,
  lineItems: s.array("The line items in this shipment.", lineItem),
  shipmentTrackingNumber: s.string("The shipment tracking number."),
  shippingCarrierCode: s.string("The shipping carrier code."),
  shippedDate: s.string("The shipment date and time in ISO 8601 format."),
});
const order = s.looseObject("An eBay order, including any additional upstream fields.", {
  orderId,
  creationDate: s.string("The order creation date and time."),
  lastModifiedDate: s.string("The order last modification date and time."),
  orderFulfillmentStatus: s.string("The order fulfillment status."),
  orderPaymentStatus: s.string("The order payment status."),
  lineItems: s.array("The purchased line items.", s.looseObject("A purchased line item.", {})),
  buyer: s.looseObject("The buyer information returned by eBay.", {}),
  fulfillmentStartInstructions: s.array(
    "Shipping and collection instructions.",
    s.looseObject("A fulfillment instruction.", {}),
  ),
  pricingSummary: s.looseObject("The order price breakdown.", {}),
  paymentSummary: s.looseObject("The order payment summary.", {}),
  warnings,
});

export const ebayActions: ProviderActionDefinition[] = [
  defineProviderAction("ebay", {
    name: "get_user",
    description: "Get the connected eBay account's public identity and account information.",
    operationType: "read",
    requiredScopes: [ebayIdentityScope],
    inputSchema: s.requiredObject("Account lookup parameters.", {}),
    outputSchema: s.looseObject("The connected eBay user.", {
      userId: s.string("The immutable eBay user ID."),
      username: s.string("The eBay username."),
      accountType: s.string("The account type."),
      registrationMarketplaceId: s.string("The marketplace where the account was registered."),
      status: s.string("The account status."),
      businessAccount: s.looseObject("Public business account information.", {}),
      individualAccount: s.looseObject("Individual account information allowed by the granted scopes.", {}),
    }),
  }),
  defineProviderAction("ebay", {
    name: "list_orders",
    description:
      "List completed-checkout eBay orders. Without filters, eBay returns orders created in the last 90 days; orders older than two years are unavailable.",
    operationType: "read",
    requiredScopes: [ebayFulfillmentScope],
    inputSchema: s.object(
      "Order search parameters.",
      {
        fieldGroups,
        filter: s.nonEmptyString(
          "Comma-separated eBay filters, such as creationdate:[2026-01-01T00:00:00.000Z..] or orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}. If creationdate and lastmodifieddate are both present, eBay uses creationdate.",
        ),
        limit: s.integer("Orders per page. Defaults to 50.", { minimum: 1, maximum: 200 }),
        offset: s.integer("Number of orders to skip. Defaults to 0.", { minimum: 0 }),
        orderIds: s.array(
          "Up to 50 order IDs. When provided, eBay ignores all other query parameters.",
          s.nonEmptyString("An eBay order ID."),
          { minItems: 1, maxItems: 50 },
        ),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject("A page of eBay orders.", {
      orders: s.array("The orders on this page.", order),
      total: s.integer("The total number of matching orders."),
      limit: s.integer("The returned page size."),
      offset: s.integer("The returned page offset."),
      href: s.string("The URL for this page."),
      next: s.string("The next page URL, when available."),
      prev: s.string("The previous page URL, when available."),
      warnings,
    }),
  }),
  defineProviderAction("ebay", {
    name: "get_order",
    description: "Get an eBay order's line items, payment details, and shipping instructions.",
    operationType: "read",
    requiredScopes: [ebayFulfillmentScope],
    inputSchema: s.object("Order lookup parameters.", { orderId, fieldGroups }, { required: ["orderId"] }),
    outputSchema: order,
  }),
  defineProviderAction("ebay", {
    name: "list_shipping_fulfillments",
    description: "List all shipping fulfillments recorded for an eBay order.",
    operationType: "read",
    requiredScopes: [ebayFulfillmentScope],
    inputSchema: s.requiredObject("Order shipment lookup parameters.", { orderId }),
    outputSchema: s.looseObject("The shipping fulfillments for an order.", {
      fulfillments: s.array("The recorded shipping fulfillments.", fulfillment),
      total: s.integer("The total number of shipping fulfillments."),
      warnings,
    }),
  }),
  defineProviderAction("ebay", {
    name: "get_shipping_fulfillment",
    description: "Get a shipping fulfillment's line items, carrier, and tracking information.",
    operationType: "read",
    requiredScopes: [ebayFulfillmentScope],
    inputSchema: s.requiredObject("Shipping fulfillment lookup parameters.", { orderId, fulfillmentId }),
    outputSchema: fulfillment,
  }),
  defineProviderAction("ebay", {
    name: "create_shipping_fulfillment",
    description:
      "Record a shipment for an eBay order's line items. Supply the carrier and tracking number together when available. This records fulfillment; it does not purchase a shipping label.",
    operationType: "write",
    requiredScopes: [ebayFulfillmentScope],
    inputSchema: s.object(
      "Shipment details to record.",
      {
        orderId,
        lineItems: s.array(
          "The line items shipped together in this package.",
          s.object(
            "A shipped order line item.",
            {
              lineItemId: s.nonEmptyString("The order line item ID returned by get_order."),
              quantity: s.integer("The shipped quantity. Defaults to 1.", { minimum: 1 }),
            },
            { required: ["lineItemId"] },
          ),
          { minItems: 1 },
        ),
        shippedDate: s.string(
          "The actual shipment time in ISO 8601 UTC format. Defaults to the current time in eBay.",
          { format: "date-time" },
        ),
        shippingCarrierCode: s.nonEmptyString("The eBay shipping carrier code, such as USPS."),
        trackingNumber: s.nonEmptyString(
          "The carrier tracking number using only letters and digits, without spaces or hyphens.",
          { pattern: "^[A-Za-z0-9]+$" },
        ),
      },
      {
        required: ["orderId", "lineItems"],
        dependentRequired: {
          shippingCarrierCode: ["trackingNumber"],
          trackingNumber: ["shippingCarrierCode"],
        },
      },
    ),
    outputSchema: s.requiredObject("The created shipment reference.", {
      fulfillmentId,
      location: s.string("The shipping fulfillment resource URL returned by eBay."),
    }),
  }),
];
