import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "razorpay" as const;

const trimmedString = (description: string, options: { maxLength?: number } = {}) =>
  s.string(description, {
    minLength: 1,
    maxLength: options.maxLength,
    pattern: "\\S",
  });

const positiveInteger = (description: string, options: { maximum?: number } = {}) =>
  s.integer(description, {
    minimum: 1,
    ...options,
  });

const unixTimestamp = s.integer("A Unix timestamp in seconds.", {
  minimum: 0,
});

const notesSchema = s.record(
  "Key-value pairs forwarded to Razorpay notes. Razorpay accepts up to 15 pairs.",
  trimmedString("One note value."),
);

const expandOrdersSchema = s.array(
  "Additional order sub-entities to expand in the response.",
  s.stringEnum("One supported Razorpay order expansion key.", [
    "payments",
    "payments.card",
    "transfers",
    "virtual_account",
  ]),
  { minItems: 1 },
);

const orderSchema = s.object("A normalized Razorpay order.", {
  id: trimmedString("The unique identifier of the Razorpay order."),
  entity: trimmedString("The entity type returned by Razorpay."),
  amount: positiveInteger("The order amount in the smallest currency subunit."),
  amountPaid: s.nullable(s.integer("The amount paid against the order.")),
  amountDue: s.nullable(s.integer("The amount still due for the order.")),
  currency: trimmedString("The ISO currency code used for the order."),
  receipt: s.nullable(s.string("Your internal receipt reference when present.")),
  offerId: s.nullable(s.string("The Razorpay offer identifier when present.")),
  status: s.nullable(s.string("The order status returned by Razorpay.")),
  attempts: s.nullable(s.integer("The number of payment attempts recorded for the order.")),
  notes: s.unknown("The notes payload returned by Razorpay."),
  createdAt: s.nullable(s.integer("The Unix timestamp when the order was created.")),
  raw: s.looseObject("The raw Razorpay order payload."),
});

const paymentSchema = s.object("A normalized Razorpay payment.", {
  id: trimmedString("The unique identifier of the Razorpay payment."),
  entity: trimmedString("The entity type returned by Razorpay."),
  amount: positiveInteger("The payment amount in the smallest currency subunit."),
  currency: trimmedString("The ISO currency code used for the payment."),
  status: s.nullable(s.string("The payment status returned by Razorpay.")),
  orderId: s.nullable(s.string("The associated Razorpay order identifier when present.")),
  invoiceId: s.nullable(s.string("The associated Razorpay invoice identifier when present.")),
  international: s.nullable(s.boolean("Whether Razorpay marks this payment as international.")),
  method: s.nullable(s.string("The payment method used for the transaction.")),
  amountRefunded: s.nullable(s.integer("The refunded amount in smallest currency subunits.")),
  refundStatus: s.nullable(s.string("The refund status returned by Razorpay when present.")),
  captured: s.nullable(s.boolean("Whether the payment has been captured.")),
  description: s.nullable(s.string("The payment description when present.")),
  cardId: s.nullable(s.string("The Razorpay card identifier when present.")),
  bank: s.nullable(s.string("The issuing bank when present.")),
  wallet: s.nullable(s.string("The wallet provider when present.")),
  vpa: s.nullable(s.string("The UPI virtual payment address when present.")),
  email: s.nullable(s.string("The customer email when present.")),
  contact: s.nullable(s.string("The customer contact number when present.")),
  notes: s.unknown("The notes payload returned by Razorpay."),
  fee: s.nullable(s.integer("The fee charged by Razorpay when present.")),
  tax: s.nullable(s.integer("The tax charged on the fee when present.")),
  errorCode: s.nullable(s.string("The payment error code when present.")),
  errorDescription: s.nullable(s.string("The payment error description when present.")),
  errorSource: s.nullable(s.string("The payment error source when present.")),
  errorStep: s.nullable(s.string("The payment error step when present.")),
  errorReason: s.nullable(s.string("The payment error reason when present.")),
  acquirerData: s.unknown("The dynamic acquirer data object returned by Razorpay."),
  createdAt: s.nullable(s.integer("The Unix timestamp when the payment was created.")),
  raw: s.looseObject("The raw Razorpay payment payload."),
});

const refundSchema = s.object("A normalized Razorpay refund.", {
  id: trimmedString("The unique identifier of the Razorpay refund."),
  entity: trimmedString("The entity type returned by Razorpay."),
  amount: positiveInteger("The refund amount in the smallest currency subunit."),
  currency: trimmedString("The ISO currency code used for the refund."),
  paymentId: trimmedString("The Razorpay payment identifier linked to the refund."),
  receipt: s.nullable(s.string("Your internal refund receipt reference when present.")),
  notes: s.unknown("The notes payload returned by Razorpay."),
  acquirerData: s.unknown("The dynamic acquirer data returned by Razorpay."),
  createdAt: s.nullable(s.integer("The Unix timestamp when the refund was created.")),
  batchId: s.nullable(s.string("The Razorpay batch identifier when present.")),
  status: s.nullable(s.string("The refund status returned by Razorpay.")),
  speedRequested: s.nullable(s.string("The refund speed requested in the original call.")),
  speedProcessed: s.nullable(s.string("The refund speed actually processed by Razorpay.")),
  raw: s.looseObject("The raw Razorpay refund payload."),
});

const createOrderAction = defineProviderAction(service, {
  name: "create_order",
  description: "Create a Razorpay order for an amount, currency, and optional receipt metadata.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a Razorpay order.",
    {
      amount: positiveInteger("The order amount in the smallest currency subunit."),
      currency: trimmedString("The three-letter ISO currency code for the order.", {
        maxLength: 3,
      }),
      receipt: trimmedString("Your internal receipt reference. Razorpay allows up to 40 characters.", {
        maxLength: 40,
      }),
      notes: notesSchema,
    },
    { optional: ["receipt", "notes"] },
  ),
  outputSchema: s.object("The response returned when creating a Razorpay order.", {
    order: orderSchema,
  }),
});

const listOrdersAction = defineProviderAction(service, {
  name: "list_orders",
  description: "List Razorpay orders with optional receipt, status-window, and expansion filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Razorpay orders.",
    {
      authorized: s.integer("Filter orders by authorized payment state. Use 1 or 0.", {
        minimum: 0,
        maximum: 1,
      }),
      receipt: trimmedString("Filter orders by an exact receipt value.", {
        maxLength: 40,
      }),
      from: unixTimestamp,
      to: unixTimestamp,
      count: s.integer("The number of orders to return. Razorpay allows up to 100.", {
        minimum: 1,
        maximum: 100,
      }),
      skip: s.nonNegativeInteger("The number of orders to skip for pagination."),
      expand: expandOrdersSchema,
    },
    { optional: ["authorized", "receipt", "from", "to", "count", "skip", "expand"] },
  ),
  outputSchema: s.object("The response returned when listing Razorpay orders.", {
    count: s.integer("The number of orders returned in this response.", { minimum: 0 }),
    orders: s.array("The normalized Razorpay orders returned by the API.", orderSchema),
    raw: s.looseObject("The raw Razorpay collection payload."),
  }),
});

const getOrderAction = defineProviderAction(service, {
  name: "get_order",
  description: "Fetch one Razorpay order by its order identifier.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for fetching a Razorpay order.", {
    orderId: trimmedString("The Razorpay order identifier, such as order_9A33XWu170gUtm."),
  }),
  outputSchema: s.object("The response returned when fetching a Razorpay order.", {
    order: orderSchema,
  }),
});

const getPaymentAction = defineProviderAction(service, {
  name: "get_payment",
  description: "Fetch one Razorpay payment by its payment identifier.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for fetching a Razorpay payment.", {
    paymentId: trimmedString("The Razorpay payment identifier, such as pay_29QQoUBi66xm2f."),
  }),
  outputSchema: s.object("The response returned when fetching a Razorpay payment.", {
    payment: paymentSchema,
  }),
});

const listPaymentsAction = defineProviderAction(service, {
  name: "list_payments",
  description: "List Razorpay payments within an optional time window and pagination range.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Razorpay payments.",
    {
      from: unixTimestamp,
      to: unixTimestamp,
      count: s.integer("The number of payments to return. Razorpay allows up to 100.", {
        minimum: 1,
        maximum: 100,
      }),
      skip: s.nonNegativeInteger("The number of payments to skip for pagination."),
    },
    { optional: ["from", "to", "count", "skip"] },
  ),
  outputSchema: s.object("The response returned when listing Razorpay payments.", {
    count: s.integer("The number of payments returned in this response.", { minimum: 0 }),
    payments: s.array("The normalized Razorpay payments returned by the API.", paymentSchema),
    raw: s.looseObject("The raw Razorpay collection payload."),
  }),
});

const createRefundAction = defineProviderAction(service, {
  name: "create_refund",
  description: "Create a Razorpay refund for a payment, with optional amount, speed, and notes.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a Razorpay refund.",
    {
      paymentId: trimmedString("The Razorpay payment identifier to refund."),
      amount: positiveInteger("The refund amount in the smallest currency subunit."),
      speed: s.stringEnum("The refund processing speed requested from Razorpay.", ["normal", "optimum"]),
      receipt: trimmedString("Your internal refund receipt reference.", {
        maxLength: 40,
      }),
      notes: notesSchema,
    },
    { optional: ["amount", "speed", "receipt", "notes"] },
  ),
  outputSchema: s.object("The response returned when creating a Razorpay refund.", {
    refund: refundSchema,
  }),
});

export const razorpayActions: ProviderActionDefinition[] = [
  createOrderAction,
  listOrdersAction,
  getOrderAction,
  getPaymentAction,
  listPaymentsAction,
  createRefundAction,
] as const satisfies Array<ProviderActionDefinition<any>>;
