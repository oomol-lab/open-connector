import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shipday";

const positiveIdSchema = s.positiveInteger("The positive Shipday identifier.");
const orderItemSchema = s.object(
  "A Shipday order item.",
  {
    name: s.nonEmptyString("The name of the order item."),
    unitPrice: s.number("The price of one unit of the order item."),
    quantity: s.integer("The quantity of the order item.", { minimum: 1 }),
    addOns: s.array("The add-on names for the order item.", s.string("One add-on name.")),
    detail: s.string("The detailed note for the order item."),
  },
  { optional: ["addOns", "detail"] },
);

const addressSchema = s.object(
  "A structured Shipday address.",
  {
    unit: s.string("The unit or second address line."),
    street: s.string("The street or first address line."),
    city: s.string("The city name."),
    state: s.string("The state, province, or region."),
    zip: s.string("The postal code."),
    country: s.string("The country name."),
  },
  { optional: ["unit", "street", "city", "state", "zip", "country"] },
);

const locationSchema = s.object(
  "A structured Shipday pickup or dropoff location.",
  {
    address: addressSchema,
  },
  { optional: ["address"] },
);

const createOrderInputSchema = s.object(
  "The input payload for inserting a Shipday delivery order.",
  {
    orderNumber: s.nonEmptyString("The alphanumeric identifier for the order."),
    customerName: s.nonEmptyString("The name of the customer."),
    customerAddress: s.nonEmptyString("The address of the customer."),
    customerPhoneNumber: s.nonEmptyString("The phone number of the customer with country code."),
    restaurantName: s.nonEmptyString("The name of the restaurant."),
    restaurantAddress: s.nonEmptyString("The address of the restaurant."),
    customerEmail: s.email("The email address of the customer."),
    restaurantPhoneNumber: s.string("The phone number of the restaurant with country code."),
    expectedDeliveryDate: s.date("The expected delivery date in yyyy-mm-dd format."),
    expectedPickupTime: s.string("The expected pickup time in hh:mm:ss format."),
    expectedDeliveryTime: s.string("The expected delivery time in hh:mm:ss format."),
    pickupLatitude: s.number("The pickup location latitude."),
    pickupLongitude: s.number("The pickup location longitude."),
    deliveryLatitude: s.number("The delivery location latitude."),
    deliveryLongitude: s.number("The delivery location longitude."),
    orderItem: s.array("The order items to send to Shipday.", orderItemSchema),
    tips: s.number("The tip amount for the order."),
    tax: s.number("The tax amount for the order."),
    discountAmount: s.number("The discount amount for the order."),
    deliveryFee: s.number("The delivery fee amount for the order."),
    totalOrderCost: s.number("The total cost for the order."),
    pickupInstruction: s.string("The pickup instructions for the order."),
    deliveryInstruction: s.string("The delivery instructions for the driver or restaurant."),
    orderSource: s.string("The source of the order."),
    additionalId: s.string("The additional ID for the order."),
    clientRestaurantId: s.integer("The client restaurant ID."),
    paymentMethod: s.stringEnum("The selected payment method for the order.", ["cash", "credit_card"]),
    creditCardType: s.stringEnum("The type of credit card used for the order.", [
      "VISA",
      "MASTER_CARD",
      "AMEX",
      "OTHER",
    ]),
    creditCardId: s.integer("The last four digits of the credit card."),
    pickup: locationSchema,
    dropoff: locationSchema,
    isCatering: s.boolean("Whether this is a catering order."),
  },
  {
    optional: [
      "customerEmail",
      "restaurantPhoneNumber",
      "expectedDeliveryDate",
      "expectedPickupTime",
      "expectedDeliveryTime",
      "pickupLatitude",
      "pickupLongitude",
      "deliveryLatitude",
      "deliveryLongitude",
      "orderItem",
      "tips",
      "tax",
      "discountAmount",
      "deliveryFee",
      "totalOrderCost",
      "pickupInstruction",
      "deliveryInstruction",
      "orderSource",
      "additionalId",
      "clientRestaurantId",
      "paymentMethod",
      "creditCardType",
      "creditCardId",
      "pickup",
      "dropoff",
      "isCatering",
    ],
    additionalProperties: true,
  },
);

const editOrderInputSchema = s.object(
  "The input payload for editing a Shipday delivery order.",
  {
    orderId: positiveIdSchema,
    orderNo: s.nonEmptyString("The numeric or alphanumeric identifier for the order."),
    customerName: s.nonEmptyString("The name of the customer."),
    customerAddress: s.nonEmptyString("The address of the customer."),
    customerEmail: s.email("The email address of the customer."),
    customerPhoneNumber: s.nonEmptyString("The phone number of the customer with country code."),
    restaurantName: s.nonEmptyString("The name of the restaurant."),
    restaurantAddress: s.nonEmptyString("The address of the restaurant."),
    restaurantPhoneNumber: s.string("The phone number of the restaurant with country code."),
    expectedDeliveryDate: s.date("The expected delivery date in yyyy-mm-dd format."),
    expectedPickupTime: s.string("The expected pickup time in hh:mm:ss format."),
    expectedDeliveryTime: s.string("The expected delivery time in hh:mm:ss format."),
    pickupLatitude: s.number("The pickup location latitude."),
    pickupLongitude: s.number("The pickup location longitude."),
    deliveryLatitude: s.number("The delivery location latitude."),
    deliveryLongitude: s.number("The delivery location longitude."),
    orderItems: s.array("The order items to send to Shipday.", orderItemSchema),
    tip: s.number("The tip amount for the order."),
    tax: s.number("The tax amount for the order."),
    discountAmount: s.number("The discount amount for the order."),
    deliveryFee: s.number("The delivery fee amount for the order."),
    totalCost: s.string("The total cost for the order."),
    deliveryInstruction: s.string("The delivery instructions for the driver or restaurant."),
    orderSource: s.string("The source of the order."),
    additionalId: s.string("The additional ID for the order."),
    clientRestaurantId: s.integer("The client restaurant ID."),
    paymentMethod: s.string("The selected payment method for the order."),
  },
  {
    optional: [
      "restaurantPhoneNumber",
      "expectedDeliveryDate",
      "expectedPickupTime",
      "expectedDeliveryTime",
      "pickupLatitude",
      "pickupLongitude",
      "deliveryLatitude",
      "deliveryLongitude",
      "orderItems",
      "tip",
      "tax",
      "discountAmount",
      "deliveryFee",
      "totalCost",
      "deliveryInstruction",
      "orderSource",
      "additionalId",
      "clientRestaurantId",
      "paymentMethod",
    ],
    additionalProperties: true,
  },
);

const orderIdInputSchema = s.actionInput(
  { orderId: positiveIdSchema },
  ["orderId"],
  "The input payload for one Shipday order ID.",
);
const getOrderInputSchema = s.actionInput(
  { orderNumber: s.nonEmptyString("The Shipday order number.") },
  ["orderNumber"],
  "The input payload for retrieving one Shipday order by order number.",
);

const listActiveOrdersOutputSchema = s.actionOutput(
  {
    orders: s.array("The active orders returned by Shipday.", s.looseObject("A Shipday order.")),
  },
  "The active Shipday orders response.",
);

const orderOutputSchema = s.actionOutput(
  {
    order: s.looseObject("The Shipday order returned by the API."),
  },
  "The Shipday order response.",
);

const carriersOutputSchema = s.actionOutput(
  {
    carriers: s.array("The carriers returned by Shipday.", s.looseObject("A Shipday carrier.")),
  },
  "The Shipday carriers response.",
);

const confirmationOutputSchema = s.actionOutput(
  {
    success: s.boolean("Whether the Shipday request completed successfully."),
    orderId: positiveIdSchema,
    raw: s.unknown("The raw response body returned by Shipday."),
  },
  "A stable confirmation for a Shipday mutation.",
);

const createOrderOutputSchema = s.actionOutput(
  {
    success: s.boolean("Whether the order insert completed successfully."),
    response: s.string("The response message returned by Shipday."),
    orderId: s.integer("The inserted Shipday order ID."),
    raw: s.unknown("The raw response body returned by Shipday."),
  },
  "The Shipday create order response.",
);

const trackingProgressInputSchema = s.object(
  "The input payload for retrieving Shipday order delivery progress.",
  {
    trackingId: s.nonEmptyString("The Shipday tracking ID."),
    isStaticDataRequired: s.boolean(
      "Whether the response should include static customer, restaurant, and carrier details.",
    ),
  },
  { optional: ["isStaticDataRequired"] },
);

const trackingProgressOutputSchema = s.actionOutput(
  {
    progress: s.looseObject("The delivery progress returned by Shipday."),
  },
  "The Shipday delivery progress response.",
);

export const shipdayActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_active_orders",
    description: "Retrieve active delivery orders from Shipday.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for listing active Shipday orders."),
    outputSchema: listActiveOrdersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Retrieve one Shipday delivery order by order number.",
    requiredScopes: [],
    inputSchema: getOrderInputSchema,
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_order",
    description: "Insert a Shipday delivery order.",
    requiredScopes: [],
    inputSchema: createOrderInputSchema,
    outputSchema: createOrderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "edit_order",
    description: "Edit an existing Shipday delivery order.",
    requiredScopes: [],
    inputSchema: editOrderInputSchema,
    outputSchema: confirmationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_order",
    description: "Delete a Shipday delivery order by order ID.",
    requiredScopes: [],
    inputSchema: orderIdInputSchema,
    outputSchema: confirmationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_carriers",
    description: "Retrieve carriers configured in Shipday.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for listing Shipday carriers."),
    outputSchema: carriersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_order_progress",
    description: "Retrieve real-time delivery progress and ETA for a Shipday order.",
    requiredScopes: [],
    inputSchema: trackingProgressInputSchema,
    outputSchema: trackingProgressOutputSchema,
  }),
];
