import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "payrexx";

const emptyInputSchema = s.requiredObject("The input payload for this action.", {});
const resourceSchema = s.looseObject("A Payrexx resource returned by the API.");

const listTransactionsInputSchema = s.object("Filters and pagination for Payrexx transactions.", {
  filterDatetimeUtcGreaterThan: s.optional(
    s.string("Return transactions after this UTC timestamp in YYYY-MM-DD HH:MM:SS format."),
  ),
  filterDatetimeUtcLessThan: s.optional(
    s.string("Return transactions before this UTC timestamp in YYYY-MM-DD HH:MM:SS format."),
  ),
  filterMyTransactionsOnly: s.optional(
    s.boolean("Whether to return only transactions associated with the current API key."),
  ),
  orderByTime: s.optional(s.stringEnum("Sort direction for the transaction timestamp.", ["ASC", "DESC"])),
  offset: s.optional(s.integer("The number of transaction rows to skip.", { minimum: 0 })),
  limit: s.optional(s.positiveInteger("The maximum number of transactions to return.")),
});

const idInputSchema = (description: string) =>
  s.requiredObject(description, {
    id: s.positiveInteger("The numeric Payrexx resource identifier."),
  });

const createGatewayInputSchema = s.requiredObject("The payment gateway to create.", {
  amount: s.positiveInteger("The payment amount in the smallest currency unit, such as cents."),
  currency: s.string("The ISO 4217 currency code.", {
    minLength: 3,
    maxLength: 3,
  }),
  purpose: s.optional(s.string("The purpose shown for the payment.")),
  referenceId: s.optional(s.string("An internal reference identifier from your system.")),
  sku: s.optional(s.string("The product stock keeping unit.")),
  vatRate: s.optional(s.number("The VAT rate percentage.")),
  successRedirectUrl: s.optional(s.url("The URL where the shopper is redirected after a successful payment.")),
  failedRedirectUrl: s.optional(s.url("The URL where the shopper is redirected after a failed payment.")),
  cancelRedirectUrl: s.optional(s.url("The URL where the shopper is redirected after cancelling the payment.")),
  preAuthorization: s.optional(s.boolean("Whether the payment should be authorized for later capture.")),
  reservation: s.optional(s.boolean("Whether the payment amount should be reserved for later capture.")),
});

const paymentProvidersOutputSchema = s.object("The payment providers configured for the Payrexx instance.", {
  paymentProviders: s.array("Configured payment providers.", resourceSchema),
});

const transactionsOutputSchema = s.requiredObject("The matching Payrexx transactions.", {
  transactions: s.array("Matching transactions.", resourceSchema),
});

const transactionOutputSchema = s.requiredObject("The requested Payrexx transaction.", {
  transaction: resourceSchema,
});

const gatewayOutputSchema = s.requiredObject("The requested Payrexx gateway.", {
  gateway: resourceSchema,
});

const createdGatewayOutputSchema = s.requiredObject("The created Payrexx gateway.", {
  gateway: s.looseRequiredObject("The created gateway and its hosted checkout details.", {
    link: s.url("The hosted Payrexx checkout URL."),
  }),
});

export const payrexxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_payment_providers",
    operationType: "read",
    description: "List payment providers configured for the connected Payrexx instance.",
    inputSchema: emptyInputSchema,
    outputSchema: paymentProvidersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    operationType: "read",
    description: "List transactions for the connected Payrexx instance.",
    inputSchema: listTransactionsInputSchema,
    outputSchema: transactionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_transaction",
    operationType: "read",
    description: "Retrieve one Payrexx transaction by its numeric identifier.",
    inputSchema: idInputSchema("The transaction to retrieve."),
    outputSchema: transactionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_gateway",
    operationType: "read",
    description: "Retrieve one Payrexx payment gateway by its numeric identifier.",
    inputSchema: idInputSchema("The payment gateway to retrieve."),
    outputSchema: gatewayOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_gateway",
    operationType: "write",
    description: "Create a Payrexx payment gateway and return its hosted checkout link.",
    inputSchema: createGatewayInputSchema,
    outputSchema: createdGatewayOutputSchema,
  }),
];

export type PayrexxActionName =
  | "list_payment_providers"
  | "list_transactions"
  | "get_transaction"
  | "get_gateway"
  | "create_gateway";
