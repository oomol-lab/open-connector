import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gift_up";

const nonEmptyStringSchema = (description: string) => s.nonEmptyString(description);
const codeSchema = nonEmptyStringSchema("The Gift Up gift card code.");
const idSchema = s.uuid("The Gift Up object ID.");
const giftUpDateTimeSchema = (description: string) =>
  nonEmptyStringSchema(`${description} Gift Up accepts date or datetime strings.`);
const metadataSchema = s.record(
  "Metadata key-value pairs to attach to the Gift Up event.",
  s.unknown("A metadata value."),
);
const limitSchema = s.integer("The maximum number of objects to return.", { minimum: 1, maximum: 100 });
const offsetSchema = s.nonNegativeInteger("The number of objects to skip.");
const rawObjectSchema = s.looseObject("The raw Gift Up object.");
const looseNestedObjectSchema = s.nullable(s.looseObject("The nested Gift Up object."));
const looseNestedArraySchema = (description: string) => s.array(description, s.looseObject("A nested Gift Up object."));

const eventBodyFields = {
  reason: s.string("The reason to record in the Gift Up history log."),
  locationId: s.uuid("The Gift Up location ID where the event occurred."),
  metadata: metadataSchema,
};
const eventBodyOptionalFields = ["reason", "locationId", "metadata"];

const topUpBalanceOperationInputSchema = s.object(
  "Input parameters for a Gift Up top-up operation. Provide exactly one of amount or units.",
  {
    code: codeSchema,
    amount: s.number("The currency amount for a currency-backed gift card.", { exclusiveMinimum: 0 }),
    units: s.positiveInteger("The unit quantity for a units-backed gift card."),
    ...eventBodyFields,
  },
  { optional: ["amount", "units", "reason", "locationId", "metadata"] },
);
topUpBalanceOperationInputSchema.oneOf = [{ required: ["amount"] }, { required: ["units"] }];

const redeemBalanceOperationInputSchema = s.object(
  "Input parameters for a Gift Up redemption operation. Provide exactly one of amount or units.",
  {
    code: codeSchema,
    amount: s.number("The currency amount for a currency-backed gift card.", { exclusiveMinimum: 0 }),
    units: s.positiveInteger("The unit quantity for a units-backed gift card."),
    ...eventBodyFields,
    redeemedOn: giftUpDateTimeSchema("The datetime when the redemption occurred."),
  },
  { optional: ["amount", "units", "reason", "locationId", "metadata", "redeemedOn"] },
);
redeemBalanceOperationInputSchema.oneOf = [{ required: ["amount"] }, { required: ["units"] }];

const optionalEventInputSchema = s.object(
  "Input parameters for a Gift Up gift card event.",
  {
    code: codeSchema,
    ...eventBodyFields,
  },
  { optional: eventBodyOptionalFields },
);

const pageSchema = s.object("Gift Up offset pagination metadata.", {
  total: s.nullableInteger("The total number of matching objects."),
  hasMore: s.nullableBoolean("Whether Gift Up has more objects after this page."),
  offset: s.nullableInteger("The offset used for the request."),
  limit: s.nullableInteger("The limit used for the request."),
});

const companySchema = s.object("A Gift Up company.", {
  id: s.nullableString("The company ID."),
  name: s.nullableString("The company name."),
  currency: s.nullableString("The company currency code."),
  onboardingCompleted: s.nullableBoolean("Whether all onboarding steps are complete."),
  canShowCheckout: s.nullableBoolean("Whether the checkout can render."),
  isCheckoutLive: s.nullableBoolean("Whether the checkout has been seen live."),
  raw: rawObjectSchema,
});

const giftCardSchema = s.object("A Gift Up gift card.", {
  code: s.nullableString("The gift card code."),
  title: s.nullableString("The gift card title."),
  subTitle: s.nullableString("The gift card subtitle."),
  message: s.nullableString("The message included with the gift card."),
  recipientName: s.nullableString("The gift card recipient name."),
  recipientEmail: s.nullableString("The gift card recipient email address."),
  backingType: s.nullableString("The gift card balance backing type."),
  remainingValue: s.nullableNumber("The remaining currency balance."),
  remainingUnits: s.nullableInteger("The remaining unit balance."),
  initialValue: s.nullableNumber("The initial currency balance."),
  initialUnits: s.nullableInteger("The initial unit balance."),
  equivalentValuePerUnit: s.nullableNumber("The equivalent value per unit."),
  canBeRedeemed: s.nullableBoolean("Whether the gift card can be redeemed."),
  hasExpired: s.nullableBoolean("Whether the gift card has expired."),
  notYetValid: s.nullableBoolean("Whether the gift card is not yet valid."),
  isVoided: s.nullableBoolean("Whether the gift card is voided."),
  fulfilledOn: s.nullableString("The datetime when the gift card was fulfilled."),
  expiresOn: s.nullableString("The datetime when the gift card expires."),
  validFrom: s.nullableString("The datetime when the gift card becomes valid."),
  voidedOn: s.nullableString("The datetime when the gift card was voided."),
  fulfilledBy: s.nullableString("The fulfillment method."),
  terms: s.nullableString("The terms captured when the gift card was created."),
  sku: s.nullableString("The private SKU associated with the gift card item."),
  order: looseNestedObjectSchema,
  postalFulfilment: looseNestedObjectSchema,
  emailFulfilment: looseNestedObjectSchema,
  downloadLinks: looseNestedObjectSchema,
  ledger: looseNestedArraySchema("The ledger events for the gift card."),
  raw: rawObjectSchema,
});

const itemSchema = s.object("A Gift Up item.", {
  id: s.nullableString("The item ID."),
  name: s.nullableString("The item name."),
  description: s.nullableString("The item description."),
  backingType: s.nullableString("The item balance backing type."),
  priceType: s.nullableString("The item price type."),
  price: s.nullableNumber("The item purchaser price."),
  value: s.nullableNumber("The currency balance issued by this item."),
  units: s.nullableInteger("The unit balance issued by this item."),
  equivalentValuePerUnit: s.nullableNumber("The equivalent value per unit."),
  minimumPrice: s.nullableNumber("The minimum custom price."),
  maximumPrice: s.nullableNumber("The maximum custom price."),
  availableFrom: s.nullableString("The datetime when the item becomes available."),
  availableUntil: s.nullableString("The datetime when the item stops being available."),
  group: s.nullableString("The item group name."),
  groupId: s.nullableString("The item group ID."),
  detailsURL: s.nullableString("The item details URL."),
  artworkURL: s.nullableString("The item artwork URL."),
  stockLevel: s.nullableInteger("The item stock level."),
  codes: s.array("The pre-generated item codes.", s.string("A pre-generated code.")),
  perOrderLimit: s.nullableInteger("The per-order item limit."),
  additionalTerms: s.nullableString("Additional terms for this item."),
  sku: s.nullableString("The item SKU."),
  raw: rawObjectSchema,
});

const orderSchema = s.object("A Gift Up order.", {
  id: s.nullableString("The order ID."),
  orderNumber: s.nullableString("The presentable order reference number."),
  createdOn: s.nullableString("The datetime when the order was created."),
  selectedRecipient: s.nullableString("The selected recipient mode."),
  purchaserEmail: s.nullableString("The purchaser email address."),
  purchaserName: s.nullableString("The purchaser name."),
  currency: s.nullableString("The order currency code."),
  revenue: s.nullableNumber("The order revenue."),
  tip: s.nullableNumber("The order tip."),
  serviceFee: s.nullableNumber("The order service fee."),
  discount: s.nullableNumber("The order discount."),
  shippingFee: s.nullableNumber("The order shipping fee."),
  referrer: s.nullableString("The order referrer."),
  source: s.nullableString("The order source."),
  promotions: looseNestedArraySchema("The promotions applied to the order."),
  customFields: looseNestedArraySchema("The custom fields collected for the order."),
  salesTaxes: looseNestedArraySchema("The sales taxes for the order."),
  notes: looseNestedArraySchema("The notes added to the order."),
  metadata: looseNestedObjectSchema,
  downloadLinks: looseNestedObjectSchema,
  payment: looseNestedObjectSchema,
  fulfilments: looseNestedArraySchema("The fulfillment results for created gift cards."),
  giftCards: looseNestedArraySchema("The gift cards created by the order."),
  raw: rawObjectSchema,
});

const locationSchema = s.object("A Gift Up location.", {
  id: s.nullableString("The location ID."),
  name: s.nullableString("The location name."),
  raw: rawObjectSchema,
});

const promotionSchema = s.object("A Gift Up promotion.", {
  id: s.nullableString("The promotion ID."),
  name: s.nullableString("The promotion name."),
  noBenefit: s.nullableBoolean("Whether the promotion is used for tracking only."),
  publishedOn: s.nullableString("The datetime when the promotion was published."),
  stoppedOn: s.nullableString("The datetime when the promotion was stopped."),
  benefits: looseNestedObjectSchema,
  usage: looseNestedObjectSchema,
  limitations: looseNestedObjectSchema,
  triggers: looseNestedObjectSchema,
  raw: rawObjectSchema,
});

const transactionSchema = s.object("A Gift Up report transaction.", {
  id: s.nullableString("The transaction ID."),
  eventOccurredOn: s.nullableString("The datetime when the transaction event occurred."),
  eventOccurredAtLocationId: s.nullableString("The location ID where the transaction event occurred."),
  eventType: s.nullableString("The transaction event type."),
  reason: s.nullableString("The reason recorded for the transaction."),
  referrer: s.nullableString("The transaction referrer."),
  metadata: looseNestedObjectSchema,
  orderId: s.nullableString("The order ID associated with the transaction."),
  currency: s.nullableString("The transaction currency code."),
  giftUpFee: s.nullableNumber("The Gift Up fee for the transaction."),
  whoName: s.nullableString("The name of the user who triggered the event."),
  whoEmail: s.nullableString("The email of the user who triggered the event."),
  orderDetails: looseNestedObjectSchema,
  giftCard: looseNestedObjectSchema,
  raw: rawObjectSchema,
});

const transactionResultSchema = s.object("The Gift Up gift card transaction result.", {
  transactionId: s.nullableString("The Gift Up transaction ID."),
  remainingCredit: s.nullableNumber("The remaining currency balance."),
  remainingUnits: s.nullableInteger("The remaining unit balance."),
  redeemedAmount: s.nullableNumber("The redeemed currency amount."),
  redeemedUnits: s.nullableInteger("The redeemed units."),
  amountReversed: s.nullableNumber("The reversed currency amount."),
  unitsReversed: s.nullableInteger("The reversed units."),
  alreadyReversed: s.nullableBoolean("Whether the transaction was already reversed."),
  raw: rawObjectSchema,
});

const successResultSchema = s.object("The Gift Up operation result.", {
  success: s.boolean("Whether Gift Up accepted the operation."),
  raw: rawObjectSchema,
});

export const giftUpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company",
    description: "Get the Gift Up company associated with the API key.",
    inputSchema: s.object("Input parameters for getting the Gift Up company.", {}),
    outputSchema: s.object("The Gift Up company response.", { company: companySchema }),
  }),
  defineProviderAction(service, {
    name: "list_gift_cards",
    description: "List Gift Up gift cards with optional filters.",
    inputSchema: s.object(
      "Input parameters for listing Gift Up gift cards.",
      {
        status: s.stringEnum("Only include gift cards in this state.", ["active", "expired", "redeemed", "voided"]),
        createdOnOrAfter: giftUpDateTimeSchema("Only include gift cards created on or after this datetime."),
        updatedOnOrAfter: giftUpDateTimeSchema("Only include gift cards updated on or after this datetime."),
        orderId: idSchema,
        sku: nonEmptyStringSchema("Only include gift cards with this SKU."),
        recipientEmail: s.email("Only include gift cards for this recipient email address."),
        purchaserEmail: s.email("Only include gift cards for this purchaser email address."),
        paymentTransactionId: nonEmptyStringSchema(
          "Only include gift cards with this payment provider transaction ID.",
        ),
        limit: limitSchema,
        offset: offsetSchema,
      },
      {
        optional: [
          "status",
          "createdOnOrAfter",
          "updatedOnOrAfter",
          "orderId",
          "sku",
          "recipientEmail",
          "purchaserEmail",
          "paymentTransactionId",
          "limit",
          "offset",
        ],
      },
    ),
    outputSchema: s.object("The Gift Up gift card list response.", {
      page: pageSchema,
      giftCards: s.array("The Gift Up gift cards in this page.", giftCardSchema),
      raw: s.unknown("The raw Gift Up list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_gift_card",
    description: "Get one Gift Up gift card by code.",
    inputSchema: s.object("Input parameters for getting a Gift Up gift card.", { code: codeSchema }),
    outputSchema: s.object("The Gift Up gift card response.", { giftCard: giftCardSchema }),
  }),
  defineProviderAction(service, {
    name: "reactivate_gift_card",
    description: "Reactivate a voided Gift Up gift card.",
    inputSchema: optionalEventInputSchema,
    outputSchema: successResultSchema,
  }),
  defineProviderAction(service, {
    name: "void_gift_card",
    description: "Void a Gift Up gift card so it can no longer be redeemed.",
    inputSchema: optionalEventInputSchema,
    outputSchema: successResultSchema,
  }),
  defineProviderAction(service, {
    name: "top_up_gift_card",
    description: "Add currency amount or units to a Gift Up gift card.",
    inputSchema: topUpBalanceOperationInputSchema,
    outputSchema: transactionResultSchema,
  }),
  defineProviderAction(service, {
    name: "redeem_gift_card",
    description: "Redeem a currency amount or units from a Gift Up gift card.",
    inputSchema: redeemBalanceOperationInputSchema,
    outputSchema: transactionResultSchema,
  }),
  defineProviderAction(service, {
    name: "redeem_gift_card_in_full",
    description: "Redeem all remaining balance from a Gift Up gift card.",
    inputSchema: s.object(
      "Input parameters for redeeming a Gift Up gift card in full.",
      {
        code: codeSchema,
        ...eventBodyFields,
        redeemedOn: giftUpDateTimeSchema("The datetime when the redemption occurred."),
      },
      { optional: ["reason", "locationId", "metadata", "redeemedOn"] },
    ),
    outputSchema: transactionResultSchema,
  }),
  defineProviderAction(service, {
    name: "undo_gift_card_redemption",
    description: "Undo a previous Gift Up gift card redemption transaction.",
    inputSchema: s.object(
      "Input parameters for undoing a Gift Up gift card redemption.",
      {
        code: codeSchema,
        transactionId: idSchema,
        reason: s.string("The reason to record in the Gift Up history log."),
        metadata: metadataSchema,
      },
      { optional: ["reason", "metadata"] },
    ),
    outputSchema: transactionResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_items",
    description: "List Gift Up items, optionally filtered by item group.",
    inputSchema: s.object(
      "Input parameters for listing Gift Up items.",
      { groupId: idSchema },
      { optional: ["groupId"] },
    ),
    outputSchema: s.object("The Gift Up item list response.", {
      items: s.array("The Gift Up items.", itemSchema),
      raw: s.unknown("The raw Gift Up list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get one Gift Up item by ID.",
    inputSchema: s.object("Input parameters for getting a Gift Up item.", { id: idSchema }),
    outputSchema: s.object("The Gift Up item response.", { item: itemSchema }),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description: "List Gift Up orders with optional filters.",
    inputSchema: s.object(
      "Input parameters for listing Gift Up orders.",
      {
        createdOnOrAfter: giftUpDateTimeSchema("Only include orders created on or after this datetime."),
        purchaserEmail: s.email("Only include orders for this purchaser email address."),
        source: s.stringEnum("Only include orders from this source.", [
          "API",
          "Checkout",
          "Dashboard",
          "Import",
          "Square",
          "Vend",
          "External",
        ]),
        limit: limitSchema,
        offset: offsetSchema,
      },
      { optional: ["createdOnOrAfter", "purchaserEmail", "source", "limit", "offset"] },
    ),
    outputSchema: s.object("The Gift Up order list response.", {
      page: pageSchema,
      orders: s.array("The Gift Up orders in this page.", orderSchema),
      raw: s.unknown("The raw Gift Up list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Get one Gift Up order by ID or order number.",
    inputSchema: s.object("Input parameters for getting a Gift Up order.", {
      id: nonEmptyStringSchema("The Gift Up order ID or order number."),
    }),
    outputSchema: s.object("The Gift Up order response.", { order: orderSchema }),
  }),
  defineProviderAction(service, {
    name: "list_locations",
    description: "List Gift Up account locations.",
    inputSchema: s.object("Input parameters for listing Gift Up locations.", {}),
    outputSchema: s.object("The Gift Up location list response.", {
      locations: s.array("The Gift Up locations.", locationSchema),
      raw: s.unknown("The raw Gift Up list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_promotions",
    description: "List Gift Up promotions.",
    inputSchema: s.object("Input parameters for listing Gift Up promotions.", {}),
    outputSchema: s.object("The Gift Up promotion list response.", {
      promotions: s.array("The Gift Up promotions.", promotionSchema),
      raw: s.unknown("The raw Gift Up list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_report_transactions",
    description: "List Gift Up report transactions with optional filters.",
    inputSchema: s.object(
      "Input parameters for listing Gift Up report transactions.",
      {
        eventOccurredOnOrAfter: giftUpDateTimeSchema(
          "Only include transactions that occurred on or after this datetime.",
        ),
        eventOccurredOnOrBefore: giftUpDateTimeSchema(
          "Only include transactions that occurred on or before this datetime.",
        ),
        events: s.array(
          "Only include transactions for these Gift Up event types.",
          nonEmptyStringSchema("A Gift Up event type."),
          {
            minItems: 1,
          },
        ),
        users: s.array(
          "Only include transactions generated by these user email addresses.",
          s.email("A Gift Up user email address."),
          {
            minItems: 1,
          },
        ),
        locations: s.array("Only include transactions generated at these location IDs.", idSchema, { minItems: 1 }),
        code: codeSchema,
        limit: limitSchema,
        offset: offsetSchema,
      },
      {
        optional: [
          "eventOccurredOnOrAfter",
          "eventOccurredOnOrBefore",
          "events",
          "users",
          "locations",
          "code",
          "limit",
          "offset",
        ],
      },
    ),
    outputSchema: s.object("The Gift Up report transaction list response.", {
      page: pageSchema,
      transactions: s.array("The Gift Up report transactions in this page.", transactionSchema),
      raw: s.unknown("The raw Gift Up list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_report_transaction",
    description: "Get one Gift Up report transaction by ID.",
    inputSchema: s.object("Input parameters for getting a Gift Up report transaction.", { id: idSchema }),
    outputSchema: s.object("The Gift Up report transaction response.", { transaction: transactionSchema }),
  }),
];
