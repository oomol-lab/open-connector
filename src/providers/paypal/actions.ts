import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "paypal" as const;

const nonEmptyString = (description: string, maxLength?: number) =>
  s.nonEmptyString(description, {
    ...(maxLength === undefined ? {} : { maxLength }),
  });

const currencyCodeSchema = s.string("The three-character ISO 4217 currency code, such as USD or EUR.", {
  minLength: 3,
  maxLength: 3,
});

const countryCodeSchema = s.string(
  "The two-character ISO 3166-1 country code, such as US or GB; use C2 for PayPal's supported China cross-border cases.",
  { minLength: 2, maxLength: 2 },
);

const nonNegativeAmountValueSchema = nonEmptyString("The non-negative decimal amount represented as a string.", 32);

const positiveAmountValueSchema = nonEmptyString("The positive decimal amount represented as a string.", 32);

const moneySchema = s.object("A non-negative PayPal money amount.", {
  currencyCode: currencyCodeSchema,
  value: nonNegativeAmountValueSchema,
});

const positiveMoneySchema = s.object("A positive PayPal money amount.", {
  currencyCode: currencyCodeSchema,
  value: positiveAmountValueSchema,
});

const amountBreakdownSchema = s.object(
  "Optional components that must add up to the purchase unit total.",
  {
    itemTotal: s.describe(moneySchema, "The total amount for all items."),
    shipping: s.describe(moneySchema, "The shipping amount."),
    handling: s.describe(moneySchema, "The handling amount."),
    taxTotal: s.describe(moneySchema, "The total tax amount."),
    insurance: s.describe(moneySchema, "The insurance amount."),
    shippingDiscount: s.describe(moneySchema, "The shipping discount amount."),
    discount: s.describe(moneySchema, "The order discount amount."),
  },
  {
    optional: ["itemTotal", "shipping", "handling", "taxTotal", "insurance", "shippingDiscount", "discount"],
  },
);

const orderAmountSchema = s.object(
  "The total amount for a PayPal purchase unit.",
  {
    currencyCode: currencyCodeSchema,
    value: positiveAmountValueSchema,
    breakdown: amountBreakdownSchema,
  },
  { optional: ["breakdown"] },
);

const itemSchema = s.object(
  "One item purchased in a PayPal order.",
  {
    name: nonEmptyString("The item name or title.", 127),
    unitAmount: s.describe(moneySchema, "The price for one unit of the item."),
    quantity: s.integer("The whole-number quantity purchased.", {
      minimum: 1,
      maximum: 9_999_999_999,
    }),
    tax: s.describe(moneySchema, "The tax charged for one unit of the item."),
    description: s.string("A detailed item description.", { maxLength: 2048 }),
    sku: s.string("The stock keeping unit for the item.", { maxLength: 127 }),
    category: s.stringEnum("The PayPal item category.", ["DIGITAL_GOODS", "PHYSICAL_GOODS", "DONATION"]),
    url: s.string("The public product page URL shown to the payer.", { format: "uri", maxLength: 2048 }),
    imageUrl: s.string("The public image URL shown for the item.", { format: "uri", maxLength: 2048 }),
  },
  { optional: ["tax", "description", "sku", "category", "url", "imageUrl"] },
);

const shippingSchema = s.object(
  "A shipping name and address supplied to PayPal for this purchase unit.",
  {
    fullName: nonEmptyString("The full name of the shipment recipient.", 300),
    addressLine1: nonEmptyString("The first line of the shipping address.", 300),
    addressLine2: s.string("The second line of the shipping address.", { maxLength: 300 }),
    city: s.string("The city, town, or locality for the shipping address.", { maxLength: 120 }),
    state: s.string("The state, province, or region for the shipping address.", {
      maxLength: 300,
    }),
    postalCode: s.string("The postal or ZIP code for the shipping address.", {
      maxLength: 60,
    }),
    countryCode: countryCodeSchema,
  },
  { optional: ["addressLine2", "city", "state", "postalCode"] },
);

const purchaseUnitSchema = s.object(
  "One contract between the payer and the merchant within a PayPal order.",
  {
    referenceId: nonEmptyString("The caller-defined purchase unit identifier.", 256),
    amount: orderAmountSchema,
    description: s.string("The purchase description.", { minLength: 1, maxLength: 3000 }),
    customId: s.string("The external reconciliation identifier.", {
      minLength: 1,
      maxLength: 255,
    }),
    invoiceId: s.string("The merchant invoice identifier, which should be unique.", {
      minLength: 1,
      maxLength: 127,
    }),
    softDescriptor: s.string(
      "The statement descriptor input; PayPal reflects only the first 22 characters in responses and card statements.",
      {
        minLength: 1,
        maxLength: 1000,
      },
    ),
    items: s.array("The items purchased in this purchase unit.", itemSchema, {
      minItems: 1,
    }),
    shipping: shippingSchema,
  },
  {
    optional: ["referenceId", "description", "customId", "invoiceId", "softDescriptor", "items", "shipping"],
  },
);

const paypalExperienceSchema = s.object(
  "Optional settings for the payer's PayPal approval experience.",
  {
    brandName: s.string("The business name shown during PayPal checkout.", {
      minLength: 1,
      maxLength: 127,
    }),
    locale: s.string("The BCP 47 locale for PayPal checkout pages, such as en-US.", {
      minLength: 2,
      maxLength: 10,
    }),
    shippingPreference: s.stringEnum("How PayPal obtains the shipping address.", [
      "GET_FROM_FILE",
      "NO_SHIPPING",
      "SET_PROVIDED_ADDRESS",
    ]),
    returnUrl: s.url("The URL where PayPal redirects the payer after approval."),
    cancelUrl: s.url("The URL where PayPal redirects the payer after cancellation."),
    landingPage: s.stringEnum("The PayPal checkout landing page preference.", [
      "LOGIN",
      "GUEST_CHECKOUT",
      "NO_PREFERENCE",
      "BILLING",
    ]),
    userAction: s.stringEnum("Whether checkout shows Continue or Pay Now.", ["CONTINUE", "PAY_NOW"]),
    paymentMethodPreference: s.stringEnum("The merchant payment method preference.", [
      "UNRESTRICTED",
      "IMMEDIATE_PAYMENT_REQUIRED",
    ]),
  },
  {
    optional: [
      "brandName",
      "locale",
      "shippingPreference",
      "returnUrl",
      "cancelUrl",
      "landingPage",
      "userAction",
      "paymentMethodPreference",
    ],
  },
);

const requestIdSchema = nonEmptyString(
  "An optional PayPal idempotency key. Reuse it when retrying the same operation.",
  108,
);

const partialAmountRequestIdSchema = s.describe(
  requestIdSchema,
  "Required when amount is provided; reuse the same PayPal idempotency key when retrying the operation.",
);

const createOrderInputSchema = s.object(
  "Input for creating a PayPal order.",
  {
    intent: s.stringEnum("Whether the order will be captured or authorized after approval.", ["CAPTURE", "AUTHORIZE"]),
    purchaseUnits: s.array("The purchase units included in the order.", purchaseUnitSchema, {
      minItems: 1,
      maxItems: 10,
    }),
    paypalExperience: paypalExperienceSchema,
    requestId: requestIdSchema,
  },
  { optional: ["paypalExperience", "requestId"] },
);

const orderIdSchema = nonEmptyString("The PayPal-generated order ID.", 36);
const authorizationIdSchema = nonEmptyString("The PayPal-generated authorization ID.");
const captureIdSchema = nonEmptyString("The PayPal-generated captured payment ID.");
const refundIdSchema = nonEmptyString("The PayPal-generated refund ID.");

const rawOrderSchema = s.looseObject("The complete PayPal order resource returned by the API.");
const rawAuthorizationSchema = s.looseObject("The complete PayPal authorization resource returned by the API.");
const rawCaptureSchema = s.looseObject("The complete PayPal captured payment resource returned by the API.");
const rawRefundSchema = s.looseObject("The complete PayPal refund resource returned by the API.");

const orderOutputSchema = s.object("A PayPal order result.", {
  order: rawOrderSchema,
});

const authorizationOutputSchema = s.object("A PayPal authorization result.", {
  authorization: rawAuthorizationSchema,
});

const captureOutputSchema = s.object("A PayPal captured payment result.", {
  capture: rawCaptureSchema,
});

const refundOutputSchema = s.object("A PayPal refund result.", {
  refund: rawRefundSchema,
});

const transactionSearchFields = [
  "transaction_info",
  "payer_info",
  "shipping_info",
  "auction_info",
  "cart_info",
  "incentive_info",
  "store_info",
  "all",
] as const;

const transactionSearchInputSchema = s.object(
  "Filters for searching PayPal account transactions.",
  {
    startDate: s.dateTime("The inclusive start date and time for the transaction search."),
    endDate: s.dateTime("The inclusive end date and time, no more than 31 days after startDate."),
    transactionId: s.string("A PayPal transaction or order ID to match.", {
      minLength: 17,
      maxLength: 19,
    }),
    transactionType: nonEmptyString("A PayPal transaction event code, such as T0006 for an Express Checkout payment."),
    transactionStatus: s.stringEnum("The transaction status to match.", ["D", "P", "S", "V"]),
    transactionAmountRange: nonEmptyString("A PayPal amount range in lower denominations, such as [500 TO 1005]."),
    currencyCode: currencyCodeSchema,
    paymentInstrumentType: s.stringEnum("The payment instrument type to match.", ["CREDITCARD", "DEBITCARD"]),
    storeId: s.string("The merchant store ID to match.", { minLength: 1, maxLength: 100 }),
    terminalId: s.string("The merchant terminal ID to match.", {
      minLength: 1,
      maxLength: 60,
    }),
    fields: s.array(
      "The transaction detail groups to include, or all for every available group.",
      s.stringEnum("One transaction detail group to include.", transactionSearchFields),
      { minItems: 1, maxItems: transactionSearchFields.length },
    ),
    balanceAffectingRecordsOnly: s.boolean(
      "Whether to return only transactions that affect the PayPal account balance.",
    ),
    pageSize: s.integer("The maximum number of transactions to return per page.", {
      minimum: 1,
      maximum: 500,
    }),
    page: s.integer("The one-based page number to return.", { minimum: 1 }),
  },
  {
    optional: [
      "transactionId",
      "transactionType",
      "transactionStatus",
      "transactionAmountRange",
      "currencyCode",
      "paymentInstrumentType",
      "storeId",
      "terminalId",
      "fields",
      "balanceAffectingRecordsOnly",
      "pageSize",
      "page",
    ],
  },
);

const rawTransactionSchema = s.looseObject("The complete PayPal transaction detail returned by the reporting API.");

const transactionSearchOutputSchema = s.object(
  "A page of PayPal account transactions and reporting metadata.",
  {
    transactions: s.array("The matching PayPal transaction details.", rawTransactionSchema),
    accountNumber: s.string("The merchant account number returned by PayPal."),
    startDate: s.dateTime("The start date and time represented by this result."),
    endDate: s.dateTime("The end date and time represented by this result."),
    lastRefreshedAt: s.dateTime("The date and time when PayPal last refreshed this report."),
    page: s.integer("The returned page number."),
    totalItems: s.integer("The total number of matching transactions."),
    totalPages: s.integer("The total number of result pages."),
  },
  {
    optional: ["accountNumber", "startDate", "endDate", "lastRefreshedAt", "page", "totalItems", "totalPages"],
  },
);

const rawBalanceSchema = s.looseObject("The complete balance detail for one PayPal account currency.");

const balancesOutputSchema = s.object(
  "PayPal account balances and the time when they were measured.",
  {
    balances: s.array("The PayPal balances grouped by currency.", rawBalanceSchema),
    accountId: s.string("The PayPal account ID associated with the balances."),
    asOfTime: s.dateTime("The date and time represented by the balances."),
    lastRefreshedAt: s.dateTime("The date and time when PayPal last refreshed the balances."),
  },
  { optional: ["accountId", "asOfTime", "lastRefreshedAt"] },
);

const trackingItemSchema = s.object(
  "One order item included in the tracked shipment.",
  {
    name: s.string("The item name or title.", { minLength: 1, maxLength: 127 }),
    quantity: s.integer("The whole-number quantity included in this shipment.", {
      minimum: 1,
      maximum: 9_999_999_999,
    }),
    sku: s.string("The merchant stock keeping unit for the item.", {
      minLength: 1,
      maxLength: 127,
    }),
    url: s.string("The public product page URL shown to the payer.", { format: "uri", maxLength: 2048 }),
    imageUrl: s.string("The public item image URL shown to the payer.", { format: "uri", maxLength: 2048 }),
    upc: s.object("The universal product code for the item.", {
      type: s.stringEnum("The UPC code format.", ["UPC-A", "UPC-B", "UPC-C", "UPC-D", "UPC-E", "UPC-2", "UPC-5"]),
      code: s.string("The numeric UPC code.", { minLength: 6, maxLength: 17, pattern: "^[0-9]+$" }),
    }),
  },
  { optional: ["name", "quantity", "sku", "url", "imageUrl", "upc"] },
);

const addTrackingInputSchema = s.object(
  "Tracking information to add to a completed capture in a PayPal order.",
  {
    orderId: orderIdSchema,
    captureId: captureIdSchema,
    trackingNumber: s.string("The carrier tracking number for the shipment.", {
      minLength: 1,
      maxLength: 64,
    }),
    carrier: s.string("The PayPal carrier code, or OTHER for an unlisted carrier.", {
      minLength: 1,
      maxLength: 64,
    }),
    carrierNameOther: s.string("The carrier name when carrier is OTHER.", {
      minLength: 1,
      maxLength: 64,
    }),
    notifyPayer: s.boolean("Whether PayPal should email the tracking information to the payer."),
    items: s.array("The order items included in this shipment.", trackingItemSchema),
  },
  { optional: ["carrierNameOther", "notifyPayer", "items"] },
);

const updateTrackingInputSchema = s.object(
  "Changes to apply to tracking information in a PayPal order.",
  {
    orderId: orderIdSchema,
    trackerId: nonEmptyString("The tracker ID returned in the PayPal order resource.", 100),
    cancel: s.literal(true, { description: "Set to true to cancel this shipment tracker." }),
    notifyPayer: s.boolean("Whether PayPal should notify the payer about this shipment."),
    items: s.array("The complete replacement set of order items included in this shipment.", trackingItemSchema),
  },
  { optional: ["cancel", "notifyPayer", "items"] },
);

export const paypalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_transactions",
    description: "List PayPal account transactions for reconciliation, support, and financial reporting.",
    requiredScopes: [],
    inputSchema: transactionSearchInputSchema,
    outputSchema: transactionSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_balances",
    description: "Retrieve PayPal account balances, including available and withheld amounts by currency.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving PayPal account balances.",
      {
        asOfTime: s.dateTime("An optional historical date and time, or omit it for the latest refreshed balances."),
        currencyCode: s.describe(
          currencyCodeSchema,
          "A three-character ISO 4217 currency code, or ALL for every currency.",
        ),
      },
      { optional: ["asOfTime", "currencyCode"] },
    ),
    outputSchema: balancesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_order",
    description: "Create a PayPal order and return the approval links needed to continue checkout.",
    requiredScopes: [],
    inputSchema: createOrderInputSchema,
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Retrieve the current details and status of a PayPal order.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving a PayPal order.",
      {
        orderId: orderIdSchema,
        includePaymentSource: s.boolean("Whether PayPal should include the payment_source field in the response."),
      },
      { optional: ["includePaymentSource"] },
    ),
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "authorize_order",
    description: "Authorize an approved PayPal order so its funds can be captured later.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for authorizing an approved PayPal order.",
      { orderId: orderIdSchema, requestId: requestIdSchema },
      { optional: ["requestId"] },
    ),
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "capture_order",
    description: "Capture payment for an approved PayPal order with CAPTURE intent.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for capturing an approved PayPal order.",
      { orderId: orderIdSchema, requestId: requestIdSchema },
      { optional: ["requestId"] },
    ),
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_authorization",
    description: "Retrieve details for a PayPal authorized payment.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving an authorized PayPal payment.", {
      authorizationId: authorizationIdSchema,
    }),
    outputSchema: authorizationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "capture_authorization",
    description: "Capture all or part of an authorized PayPal payment.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for capturing an authorized PayPal payment.",
      {
        authorizationId: authorizationIdSchema,
        amount: s.describe(
          positiveMoneySchema,
          "The partial amount to capture, or omit it to capture the remaining authorized amount.",
        ),
        invoiceId: s.string("The invoice identifier associated with this capture.", {
          maxLength: 127,
        }),
        finalCapture: s.boolean("Whether this is the final capture against the authorization."),
        noteToPayer: s.string("A note about the capture shown to the payer.", {
          maxLength: 255,
        }),
        softDescriptor: s.string("The text shown on the payer's card statement.", {
          maxLength: 22,
        }),
        requestId: partialAmountRequestIdSchema,
      },
      {
        optional: ["amount", "invoiceId", "finalCapture", "noteToPayer", "softDescriptor", "requestId"],
      },
    ),
    outputSchema: captureOutputSchema,
  }),
  defineProviderAction(service, {
    name: "void_authorization",
    description: "Void a PayPal authorization that has not been fully captured.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for voiding an authorized PayPal payment.",
      {
        authorizationId: authorizationIdSchema,
        requestId: requestIdSchema,
      },
      { optional: ["requestId"] },
    ),
    outputSchema: s.object("The result of voiding a PayPal authorization.", {
      authorizationId: authorizationIdSchema,
      voided: s.boolean("Whether PayPal accepted the void operation."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_capture",
    description: "Retrieve details for a captured PayPal payment.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a captured PayPal payment.", {
      captureId: captureIdSchema,
    }),
    outputSchema: captureOutputSchema,
  }),
  defineProviderAction(service, {
    name: "refund_capture",
    description: "Refund all or part of a captured PayPal payment.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for refunding a captured PayPal payment.",
      {
        captureId: captureIdSchema,
        amount: s.describe(
          positiveMoneySchema,
          "The partial amount to refund, or omit it to refund the remaining captured amount.",
        ),
        customId: s.string("The merchant reconciliation identifier for this refund.", {
          minLength: 1,
          maxLength: 127,
        }),
        invoiceId: s.string("The merchant invoice identifier for this refund.", {
          minLength: 1,
          maxLength: 127,
        }),
        noteToPayer: s.string("The refund reason shown to the payer.", {
          minLength: 1,
          maxLength: 255,
        }),
        requestId: partialAmountRequestIdSchema,
      },
      { optional: ["amount", "customId", "invoiceId", "noteToPayer", "requestId"] },
    ),
    outputSchema: refundOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_refund",
    description: "Retrieve the current details and status of a PayPal refund.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a PayPal refund.", {
      refundId: refundIdSchema,
    }),
    outputSchema: refundOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_tracking",
    description: "Add shipment tracking information to a completed capture in a PayPal order.",
    requiredScopes: [],
    inputSchema: addTrackingInputSchema,
    outputSchema: orderOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_tracking",
    description: "Update an order shipment tracker, replace its items, notify the payer, or cancel it.",
    requiredScopes: [],
    inputSchema: updateTrackingInputSchema,
    outputSchema: s.object("The result of updating PayPal tracking information.", {
      orderId: orderIdSchema,
      trackerId: nonEmptyString("The PayPal tracker ID that was updated.", 100),
      updated: s.boolean("Whether PayPal accepted the tracking update."),
    }),
  }),
] as const satisfies ActionDefinition[];

export type PayPalActionName = (typeof paypalActions)[number]["name"];
