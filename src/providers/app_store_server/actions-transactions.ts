import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  appTransactionPayload,
  environments,
  hasMoreOutput,
  historySortOrders,
  identifierArray,
  inAppOwnershipTypes,
  millisecondTimestamp,
  nonEmptyString,
  productTypeFilters,
  revisionOutput,
  service,
  transactionListOutput,
  transactionPayload,
  uuidString,
} from "./schemas.ts";

const anyTransactionIdInput = nonEmptyString(
  "Any transaction identifier that belongs to the customer for your app: a transactionId, an originalTransactionId or an appTransactionId.",
);

const transactionInfoIdInput = nonEmptyString(
  "Identifier of the transaction to read: a transactionId or an originalTransactionId. This endpoint does not accept an appTransactionId.",
);

export const appStoreServerTransactionActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_transaction_history",
    operationType: "read",
    description:
      "List a customer's in-app purchase transactions for your app, oldest first by default, decoded from the signed payloads Apple returns. Pass sort DESCENDING to get the most recent transactions first. Returns up to 20 transactions per page.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the customer and narrows which of their transactions to return.",
      {
        transactionId: anyTransactionIdInput,
        revision: nonEmptyString(
          "Page token taken from the revision value of a previous response. Repeat every other filter unchanged when you page.",
        ),
        startDate: millisecondTimestamp("Return only transactions purchased at or after this time."),
        endDate: millisecondTimestamp("Return only transactions purchased before this time."),
        productIds: identifierArray("Return only transactions for these products.", "One product identifier."),
        productTypes: s.array(
          "Return only transactions of these product types.",
          s.stringEnum("One in-app purchase product type.", productTypeFilters),
          { minItems: 1 },
        ),
        subscriptionGroupIdentifiers: identifierArray(
          "Return only transactions for subscriptions in these groups.",
          "One subscription group identifier.",
        ),
        inAppOwnershipType: s.stringEnum("Return only transactions with this ownership type.", inAppOwnershipTypes),
        revoked: s.boolean(
          "Set to true to return only revoked transactions, or false to exclude them. Omit to return both.",
        ),
        sort: s.stringEnum(
          "Order the transactions by their recently modified date, not their purchase date. Apple sorts ASCENDING when this is omitted, so you get the oldest first. Apple refreshes the modified date when a subscription is upgraded or a purchase is revoked, so a transaction changed while you page can appear again on a later page under ASCENDING.",
          historySortOrders,
        ),
      },
      { required: ["transactionId"] },
    ),
    outputSchema: s.actionOutput(
      {
        transactions: transactionListOutput("Transactions returned for this page."),
        revision: revisionOutput,
        hasMore: hasMoreOutput,
        bundleId: s.nullableString("Bundle identifier of the app the transactions belong to."),
        appAppleId: s.nullableInteger("Apple identifier of the app, present for production apps."),
        environment: s.nullable(s.stringEnum("Server environment the transactions come from.", environments)),
      },
      "A page of transaction history.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_transaction_info",
    operationType: "read",
    description: "Read one in-app purchase transaction by identifier, decoded from the signed payload Apple returns.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { transactionId: transactionInfoIdInput },
      ["transactionId"],
      "Identifies the transaction to read.",
    ),
    outputSchema: s.actionOutput({ transaction: transactionPayload }, "The requested transaction."),
  }),
  defineProviderAction(service, {
    name: "get_app_transaction_info",
    operationType: "read",
    description:
      "Read the app download transaction for a customer, decoded from the signed payload Apple returns. It records when and on which platform the customer first acquired the app.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { transactionId: anyTransactionIdInput },
      ["transactionId"],
      "Identifies the customer whose app download transaction to read.",
    ),
    outputSchema: s.actionOutput(
      { appTransaction: appTransactionPayload },
      "The app download transaction of the customer.",
    ),
  }),
  defineProviderAction(service, {
    name: "look_up_order_id",
    operationType: "read",
    description:
      "Look up the in-app purchase transactions behind an order ID from a customer's App Store receipt, to check that the order is genuine and belongs to your app. Apple serves this endpoint only in the production environment, so it fails on a sandbox connection.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        orderId: nonEmptyString("Order ID from the customer's App Store receipt, such as FAKE-ORDER-ID."),
      },
      ["orderId"],
      "Identifies the order to look up.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.nullableInteger(
          "Whether the order ID is valid: 0 valid, 1 invalid. Apple returns no transactions for an invalid order ID.",
        ),
        transactions: transactionListOutput("Transactions the order ID covers."),
      },
      "The result of the order ID lookup.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_app_account_token",
    operationType: "destructive",
    description:
      "Set or replace the app account token on a transaction, to associate a purchase made outside your app with a customer on your own service. Overwrites any token already set.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        originalTransactionId: nonEmptyString(
          "Original transaction identifier of the transaction to update. Apple rejects a transaction identifier that is not the original one.",
        ),
        appAccountToken: uuidString(
          "UUID that identifies the customer on your own service. Generate it yourself; Apple returns it on every transaction and renewal of the chain.",
        ),
      },
      ["originalTransactionId", "appAccountToken"],
      "Identifies the transaction and the token to store on it.",
    ),
    outputSchema: s.actionOutput(
      {
        originalTransactionId: s.string("Original transaction identifier that was updated."),
        appAccountToken: s.string("Token now stored on the transaction."),
        updated: s.boolean("Always true once Apple confirmed the update."),
      },
      "Confirmation that the app account token was stored.",
    ),
  }),
  defineProviderAction(service, {
    name: "finish_transaction",
    operationType: "destructive",
    description:
      "Tell the App Store that your server finished delivering the content for a transaction. Call it only after the customer has the content; it cannot be undone. Apple still returns a finished transaction from get_transaction_history, so do not treat its disappearance as confirmation.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        transactionId: nonEmptyString("Identifier of the transaction to mark as finished."),
      },
      ["transactionId"],
      "Identifies the transaction to finish.",
    ),
    outputSchema: s.actionOutput(
      {
        transactionId: s.string("Identifier of the transaction that was finished."),
        finished: s.boolean("Always true once Apple confirmed the transaction is finished."),
      },
      "Confirmation that the transaction is finished.",
    ),
  }),
];
