import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "waffo";

const taxCategories: readonly string[] = [
  "digital_goods",
  "saas",
  "software",
  "ebook",
  "online_course",
  "consulting",
  "professional_service",
];
const cashierLanguages: readonly string[] = [
  "en",
  "pt-BR",
  "es-MX",
  "id-ID",
  "vi-VN",
  "ru-RU",
  "en-KE",
  "es-PE",
  "es-CO",
  "es-CL",
  "zh-Hant-TW",
  "zh-Hant-HK",
  "th-TH",
  "ja-JP",
  "en-NG",
  "ko-KR",
  "en-HK",
  "zh-Hans-HK",
  "pl-PL",
  "tr-TR",
  "zh-Hans",
  "ms-MY",
];
const paymentMethodSchema = s.stringEnum("A Waffo hosted checkout payment method.", [
  "card",
  "applepay",
  "googlepay",
  "wechat",
]);

const positiveAmountSchema = (description: string): JsonSchema => s.nonWhitespaceString(description);
const currencySchema = (description: string): JsonSchema =>
  s.string(description, { minLength: 3, maxLength: 3, pattern: "^[A-Za-z]{3}$" });

const priceSchema = s.object("A Waffo price for one currency.", {
  amount: positiveAmountSchema("The positive price in major currency units, such as `29.00`."),
  taxIncluded: s.optional(s.boolean("Whether the price already includes tax.")),
  taxCategory: s.stringEnum("The tax category applied to this price.", taxCategories),
});
const pricesSchema: JsonSchema = {
  ...s.record("Prices keyed by uppercase ISO 4217 currency code.", priceSchema),
  minProperties: 1,
  propertyNames: { type: "string", pattern: "^[A-Z]{3}$" },
};
const mediaSchema = s.array(
  "Product images or videos displayed by Waffo.",
  s.object(
    "One Waffo product media item.",
    {
      type: s.stringEnum("The media type.", ["image", "video"]),
      url: s.nonEmptyString("The publicly accessible media URL."),
      alt: s.string("Alternative text for the media item."),
      thumbnail: s.string("The optional thumbnail URL, recommended for videos."),
    },
    { optional: ["alt", "thumbnail"] },
  ),
);
const metadataSchema = s.record(
  "Custom JSON metadata attached to the Waffo resource.",
  s.unknown("A JSON-serializable metadata value."),
);
const productMetadataSchema: JsonSchema = { ...metadataSchema, maxProperties: 50 };
const subscriptionMetadataSchema = s.looseObject("Custom JSON metadata attached to the subscription product.", {
  trialDays: s.integer("The optional subscription trial length in days.", {
    minimum: 1,
    maximum: 365,
  }),
});
const productSuccessUrlSchema = s.nullable(
  s.string("The HTTP(S) redirect URL used after successful payment, or null to clear it.", {
    maxLength: 512,
  }),
);
const productOutputSchema = s.object("A Waffo product result.", {
  product: s.looseRequiredObject("The Waffo product.", {
    id: s.string("The Waffo product ID."),
    storeId: s.string("The owning Waffo store ID."),
    name: s.string("The product name."),
    status: s.string("The product status in the API key environment."),
  }),
});
const productFields = {
  storeId: s.nonEmptyString("The Waffo store ID in `STO_...` format."),
  name: s.nonEmptyString("The product name.", { maxLength: 64 }),
  prices: pricesSchema,
  description: s.nullableString("The Markdown product description."),
  media: mediaSchema,
  successUrl: productSuccessUrlSchema,
  metadata: metadataSchema,
};
const productTypeSchema = s.stringEnum("The Waffo product billing model.", ["one_time", "subscription"]);
const paginationFields = {
  limit: s.integer("The maximum number of records to return.", { minimum: 1 }),
  offset: s.integer("The number of matching records to skip.", { minimum: 0 }),
};
const searchDateFields = {
  createdAfter: s.dateTime("Return records created at or after this ISO 8601 timestamp."),
  createdBefore: s.dateTime("Return records created at or before this ISO 8601 timestamp."),
};
const productListItemSchema = s.looseRequiredObject("A Waffo product returned by the search.", {
  id: s.string("The Waffo product ID."),
  productType: productTypeSchema,
  name: s.string("The product name."),
  status: s.string("The product status in the connected API key environment."),
});

const productUpdateInputSchema = s.object(
  "Parameters for updating a Waffo product in the connected API key environment.",
  {
    productType: productTypeSchema,
    id: s.nonEmptyString("The Waffo product ID in `PROD_...` format."),
    name: s.nonEmptyString("The updated product name.", { maxLength: 64 }),
    description: s.nullableString("The updated Markdown description, or null to clear it."),
    prices: pricesSchema,
    media: mediaSchema,
    successUrl: productSuccessUrlSchema,
    metadata: metadataSchema,
    billingPeriod: s.stringEnum("The updated subscription billing interval.", [
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
    ]),
  },
  {
    optional: ["name", "description", "prices", "media", "successUrl", "metadata", "billingPeriod"],
  },
);
const orderSearchInputSchema = s.object(
  "Filters for searching Waffo one-time or subscription orders.",
  {
    storeId: s.nonEmptyString("The Waffo store ID in `STO_...` format."),
    orderType: s.stringEnum("The order billing model.", ["one_time", "subscription"]),
    status: s.nonEmptyString("The exact Waffo order status to match."),
    orderMerchantExternalId: s.nonEmptyString("The merchant-side order reference to match."),
    ...searchDateFields,
    ...paginationFields,
  },
  { optional: ["status", "orderMerchantExternalId", "createdAfter", "createdBefore", "limit", "offset"] },
);
const paymentSearchInputSchema = s.object(
  "Filters for searching Waffo payments.",
  {
    paymentId: s.nonEmptyString("A specific Waffo payment ID in `PAY_...` format."),
    status: s.nonEmptyString("The exact Waffo payment status to match."),
    orderMerchantExternalId: s.nonEmptyString("The merchant-side order reference to match."),
    ...searchDateFields,
    ...paginationFields,
  },
  {
    optional: ["paymentId", "status", "orderMerchantExternalId", "createdAfter", "createdBefore", "limit", "offset"],
  },
);
const refundTicketSearchInputSchema = s.object(
  "Filters for searching Waffo refund tickets.",
  {
    status: s.nonEmptyString("The exact Waffo refund ticket status to match."),
    paymentId: s.nonEmptyString("The Waffo payment ID associated with the ticket."),
    refundTicketMerchantExternalId: s.nonEmptyString("The merchant-side refund reference to match."),
    ...searchDateFields,
    ...paginationFields,
  },
  {
    optional: [
      "status",
      "paymentId",
      "refundTicketMerchantExternalId",
      "createdAfter",
      "createdBefore",
      "limit",
      "offset",
    ],
  },
);
const billingDetailSchema = s.object(
  "Billing details to prefill and lock for the checkout session.",
  {
    country: s.string("The ISO 3166-1 alpha-2 billing country code.", {
      minLength: 2,
      maxLength: 2,
      pattern: "^[A-Za-z]{2}$",
    }),
    isBusiness: s.boolean("Whether this is a business purchase."),
    postcode: s.string("The postal or ZIP code."),
    state: s.string("The state or province code."),
    businessName: s.string("The legal business name."),
    taxId: s.string("The buyer tax registration number."),
  },
  { optional: ["postcode", "state", "businessName", "taxId"] },
);
const checkoutInputSchema = s.object(
  "Parameters for creating a Waffo hosted checkout session.",
  {
    productId: s.nonEmptyString("The Waffo product ID in `PROD_...` format."),
    currency: currencySchema("The uppercase ISO 4217 checkout currency code."),
    priceSnapshot: s.object("An optional merchant-controlled checkout price override.", {
      amount: positiveAmountSchema("The positive price in major currency units."),
      taxIncluded: s.optional(s.boolean("Whether the price already includes tax.")),
      taxCategory: s.stringEnum("The tax category applied to the checkout price.", taxCategories),
    }),
    withTrial: s.boolean("Whether to enable the subscription product trial."),
    buyerEmail: s.string("The customer email to prefill on the checkout page."),
    billingDetail: billingDetailSchema,
    successUrl: s.string("The HTTP(S) redirect URL used after successful checkout."),
    expiresInSeconds: s.integer("The checkout session lifetime in seconds.", {
      minimum: 1,
      maximum: 604_800,
    }),
    darkMode: s.boolean("Whether the hosted checkout should initially use dark mode."),
    metadata: metadataSchema,
    orderMerchantExternalId: s.nonEmptyString("The merchant-side order reference.", { maxLength: 128 }),
    language: s.stringEnum("The IETF BCP 47 checkout language supported by Waffo.", cashierLanguages),
    includePaymentMethods: s.array("The payment methods to allow for this checkout session.", paymentMethodSchema),
    excludePaymentMethods: s.array("The payment methods to hide for this checkout session.", paymentMethodSchema),
  },
  {
    optional: [
      "priceSnapshot",
      "withTrial",
      "buyerEmail",
      "billingDetail",
      "successUrl",
      "expiresInSeconds",
      "darkMode",
      "metadata",
      "orderMerchantExternalId",
      "language",
      "includePaymentMethods",
      "excludePaymentMethods",
    ],
  },
);
const graphqlVariablesSchema = s.record(
  "GraphQL variables keyed by variable name.",
  s.unknown("A JSON-serializable GraphQL variable value."),
);
const graphqlEnvelopeSchema = s.looseObject("The Waffo GraphQL response envelope.", {
  data: s.optional(s.unknown("The GraphQL data returned by Waffo.")),
  errors: s.optional(
    s.array(
      "GraphQL errors returned by Waffo.",
      s.looseRequiredObject("One Waffo GraphQL error.", { message: s.string("The GraphQL error message.") }),
    ),
  ),
});

export const waffoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_store",
    operationType: "write",
    description: "Create a Waffo store for the connected merchant account.",
    inputSchema: s.object("Parameters for creating a Waffo store.", {
      name: s.nonEmptyString("The store name.", { maxLength: 48 }),
    }),
    outputSchema: s.object("A Waffo store creation result.", {
      store: s.looseRequiredObject("The created Waffo store.", {
        id: s.string("The Waffo store ID."),
        name: s.string("The store name."),
        slug: s.nullableString("The hosted store slug."),
        status: s.string("The store status."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_stores",
    operationType: "read",
    description: "List stores available to the connected Waffo merchant account.",
    inputSchema: s.object("Parameters for listing Waffo stores.", {}),
    outputSchema: s.object("The connected merchant's Waffo stores.", {
      stores: s.array(
        "The Waffo stores.",
        s.looseRequiredObject("A Waffo store.", {
          id: s.string("The Waffo store ID."),
          name: s.string("The store name."),
          status: s.string("The store status."),
        }),
      ),
      count: s.integer("The number of returned stores."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_one_time_product",
    operationType: "write",
    description: "Create a one-time purchase product with multi-currency pricing in Waffo.",
    inputSchema: s.object(
      "Parameters for creating a Waffo one-time product.",
      { ...productFields, metadata: productMetadataSchema },
      { optional: ["description", "media", "successUrl", "metadata"] },
    ),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_subscription_product",
    operationType: "write",
    description: "Create a recurring subscription product with multi-currency pricing in Waffo.",
    inputSchema: s.object(
      "Parameters for creating a Waffo subscription product.",
      {
        ...productFields,
        metadata: subscriptionMetadataSchema,
        billingPeriod: s.stringEnum("The recurring billing interval.", ["weekly", "monthly", "quarterly", "yearly"]),
      },
      { optional: ["description", "media", "successUrl", "metadata"] },
    ),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List one-time or subscription products in the connected Waffo API key environment.",
    inputSchema: s.object(
      "Parameters for listing Waffo products.",
      {
        storeId: s.nonEmptyString("The Waffo store ID in `STO_...` format."),
        productType: productTypeSchema,
        status: s.stringEnum("The product status to match.", ["active", "inactive"]),
        ...paginationFields,
      },
      { optional: ["status", "limit", "offset"] },
    ),
    outputSchema: s.object("A page of Waffo products.", {
      products: s.array("The matching Waffo products.", productListItemSchema),
      total: s.integer("The total number of matching products."),
      limit: s.integer("The requested page size."),
      offset: s.integer("The requested page offset."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_product",
    operationType: "write",
    description:
      "Update a one-time or subscription product in the connected Waffo API key environment, creating an immutable version when content changes.",
    inputSchema: productUpdateInputSchema,
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "set_product_status",
    operationType: "destructive",
    description:
      "Activate or deactivate a one-time or subscription product in the connected Waffo API key environment.",
    inputSchema: s.object("Parameters for changing a Waffo product status.", {
      productType: productTypeSchema,
      id: s.nonEmptyString("The Waffo product ID in `PROD_...` format."),
      status: s.stringEnum("The new product status.", ["active", "inactive"]),
    }),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "publish_product",
    operationType: "write",
    description:
      "Publish the active test version of a one-time or subscription product to production for the first time.",
    inputSchema: s.object("Parameters for publishing a Waffo product.", {
      productType: productTypeSchema,
      id: s.nonEmptyString("The Waffo product ID in `PROD_...` format."),
    }),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_checkout_session",
    operationType: "write",
    description: "Create a Waffo hosted checkout session for a one-time or subscription product.",
    inputSchema: checkoutInputSchema,
    outputSchema: s.object("A Waffo hosted checkout session.", {
      sessionId: s.string("The Waffo checkout session ID."),
      checkoutUrl: s.string("The hosted checkout URL to open for the customer."),
      expiresAt: s.string("The ISO 8601 checkout session expiration timestamp."),
    }),
  }),
  defineProviderAction(service, {
    name: "cancel_subscription",
    operationType: "destructive",
    description:
      "Cancel a pending Waffo subscription immediately or schedule an active subscription to end after its current period.",
    inputSchema: s.object("Parameters for canceling a Waffo subscription.", {
      orderId: s.nonEmptyString("The subscription order ID in `ORD_...` format."),
    }),
    outputSchema: s.object("The updated Waffo subscription state.", {
      orderId: s.string("The Waffo subscription order ID."),
      status: s.stringEnum("The resulting subscription status.", ["canceling", "canceled"]),
    }),
  }),
  defineProviderAction(service, {
    name: "search_orders",
    operationType: "read",
    description: "Search one-time or subscription orders by store, status, merchant reference, or creation time.",
    inputSchema: orderSearchInputSchema,
    outputSchema: s.object("A page of Waffo orders.", {
      orders: s.array(
        "The matching Waffo orders.",
        s.looseRequiredObject("A Waffo order.", {
          id: s.string("The Waffo order ID."),
          orderType: s.stringEnum("The order billing model.", ["one_time", "subscription"]),
          status: s.string("The order status."),
          createdAt: s.string("The ISO 8601 order creation timestamp."),
        }),
      ),
      total: s.integer("The total number of matching orders."),
      limit: s.integer("The requested page size."),
      offset: s.integer("The requested page offset."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_payments",
    operationType: "read",
    description: "Find a Waffo payment by ID or search payments by status, merchant order reference, or creation time.",
    inputSchema: paymentSearchInputSchema,
    outputSchema: s.object("A page of Waffo payments.", {
      payments: s.array(
        "The matching Waffo payments.",
        s.looseRequiredObject("A Waffo payment.", {
          id: s.string("The Waffo payment ID."),
          orderId: s.string("The related Waffo order ID."),
          status: s.string("The payment status."),
        }),
      ),
      total: s.integer("The total number of matching payments."),
      limit: s.integer("The requested page size."),
      offset: s.integer("The requested page offset."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_refund_tickets",
    operationType: "read",
    description: "Search Waffo refund tickets by status, payment, merchant reference, or creation time.",
    inputSchema: refundTicketSearchInputSchema,
    outputSchema: s.object("A page of Waffo refund tickets.", {
      refundTickets: s.array(
        "The matching Waffo refund tickets.",
        s.looseRequiredObject("A Waffo refund ticket.", {
          id: s.string("The Waffo refund ticket ID."),
          status: s.string("The refund ticket status."),
          createdAt: s.string("The ISO 8601 refund ticket creation timestamp."),
        }),
      ),
      total: s.integer("The total number of matching refund tickets."),
      limit: s.integer("The requested page size."),
      offset: s.integer("The requested page offset."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_refund_ticket",
    operationType: "destructive",
    description: "Request a full or partial Waffo refund for a succeeded payment.",
    inputSchema: s.object(
      "Parameters for creating a Waffo refund ticket.",
      {
        paymentId: s.nonEmptyString("The succeeded payment ID in `PAY_...` format."),
        reason: s.nonEmptyString("The refund reason shown to the customer and merchant."),
        requestedAmount: s.object("The requested refund amount.", {
          amount: positiveAmountSchema("The positive refund amount in major currency units."),
          currency: currencySchema("The uppercase ISO 4217 payment currency code."),
        }),
        refundTicketMerchantExternalId: s.string("The merchant-side refund reference.", { maxLength: 128 }),
      },
      { optional: ["refundTicketMerchantExternalId"] },
    ),
    outputSchema: s.object("A Waffo refund ticket creation result.", {
      ticket: s.looseRequiredObject("The created Waffo refund ticket.", {
        id: s.string("The Waffo refund ticket ID."),
        status: s.string("The refund ticket status."),
        subjectId: s.string("The refunded Waffo payment ID."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "resubmit_refund_ticket",
    operationType: "destructive",
    description: "Revise and resubmit a rejected or failed Waffo refund ticket.",
    inputSchema: s.object("Parameters for resubmitting a Waffo refund ticket.", {
      ticketId: s.nonEmptyString("The refund ticket ID in `TKT_...` format."),
      reason: s.nonEmptyString("The revised refund reason."),
      requestedAmount: s.object("The revised refund amount.", {
        amount: positiveAmountSchema("The positive refund amount in major currency units."),
        currency: currencySchema("The uppercase ISO 4217 payment currency code."),
      }),
    }),
    outputSchema: s.object("A Waffo refund ticket resubmission result.", {
      ticket: s.looseRequiredObject("The revised Waffo refund ticket.", {
        id: s.string("The Waffo refund ticket ID."),
        status: s.string("The refund ticket status."),
        subjectId: s.string("The refunded Waffo payment ID."),
        versionNumber: s.integer("The new refund ticket version number."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "run_query",
    operationType: "read",
    description:
      "Run a read-only query against the Waffo GraphQL API for stores, products, orders, payments, refunds, customers, or analytics.",
    inputSchema: s.object(
      "Parameters for running a Waffo GraphQL query.",
      {
        query: s.nonWhitespaceString("The GraphQL query document to execute."),
        variables: graphqlVariablesSchema,
        operationName: s.nonWhitespaceString("The operation name when the document defines multiple queries."),
      },
      { optional: ["variables", "operationName"] },
    ),
    outputSchema: graphqlEnvelopeSchema,
  }),
];
