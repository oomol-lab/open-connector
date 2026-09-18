import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dachser";

const trackingInputSchema = s.object(
  "The input payload for finding DACHSER shipments by a tracking reference.",
  {
    trackingNumber: s.nonEmptyString(
      "A DACHSER shipment reference such as a consignment, customer order, delivery note, purchase order, SSCC, bill of lading, air waybill, container, invoice, batch, or packing-list number.",
    ),
    customerId: s.nonEmptyString("An optional DACHSER customer number filter; separate multiple values with commas."),
    acceptLanguage: s.nonEmptyString(
      "An optional HTTP language preference for translated status descriptions, such as en-US or de-DE.",
    ),
  },
  { optional: ["customerId", "acceptLanguage"] },
);

const shipmentOutputSchema = s.looseRequiredObject("The shipment response returned by DACHSER.", {
  shipments: s.array(
    "The DACHSER shipments that matched the tracking reference.",
    s.unknownObject("A shipment and its status information returned by DACHSER."),
  ),
});

const deliveryOrderInputSchema = s.object(
  "The filters used to find DACHSER delivery orders. At least one reference number, purchase order number, or delivery order date is required.",
  {
    referenceNumber1: s.nonEmptyString("The first delivery-order reference number."),
    referenceNumber2: s.nonEmptyString("The second delivery-order reference number."),
    referenceNumber3: s.nonEmptyString("The third delivery-order reference number."),
    purchaseOrderNumber: s.nonEmptyString("The purchase order number."),
    deliveryOrderDate: s.string("The delivery order date in YYYY-MM-DD format.", { format: "date" }),
    eventCode: s.nonEmptyString("The DACHSER delivery-order event code."),
    customerId: s.nonEmptyString("The DACHSER customer number filter."),
    acceptLanguage: s.nonEmptyString(
      "An optional HTTP language preference for translated status descriptions, such as en-US or de-DE.",
    ),
  },
  {
    optional: [
      "referenceNumber1",
      "referenceNumber2",
      "referenceNumber3",
      "purchaseOrderNumber",
      "deliveryOrderDate",
      "eventCode",
      "customerId",
      "acceptLanguage",
    ],
  },
);

const deliveryOrderOutputSchema = s.looseRequiredObject("The delivery-order response returned by DACHSER.", {
  deliveryOrders: s.array(
    "The DACHSER delivery orders that matched the supplied filters.",
    s.unknownObject("A delivery order and its status information returned by DACHSER."),
  ),
});

export const dachserActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_shipment_status",
    operationType: "read",
    description: "Retrieve the current DACHSER status for shipments matching a tracking reference.",
    requiredScopes: [],
    inputSchema: trackingInputSchema,
    outputSchema: shipmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_shipment_history",
    operationType: "read",
    description: "Retrieve the full DACHSER event history for shipments matching a tracking reference.",
    requiredScopes: [],
    inputSchema: trackingInputSchema,
    outputSchema: shipmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_delivery_order_status",
    operationType: "read",
    description: "Retrieve DACHSER delivery-order status using order references and filters.",
    requiredScopes: [],
    inputSchema: deliveryOrderInputSchema,
    outputSchema: deliveryOrderOutputSchema,
  }),
];
