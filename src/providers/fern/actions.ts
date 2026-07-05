import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fern";

const pageTokenSchema = s.nonEmptyString("Token for forward pagination.");
const pageSizeSchema = s.integer("Number of items per page, from 1 to 100.", { minimum: 1, maximum: 100 });
const nullableStringSchema = (description: string) => s.nullableString(description);
const timestampSchema = s.dateTime("An ISO 8601 timestamp returned by Fern.");
const currencySchema = s.looseRequiredObject(
  "A fiat or crypto currency returned by Fern.",
  {
    label: s.string("Currency label or contract address returned by Fern."),
  },
  { optional: ["label"] },
);

const customerSchema = s.looseRequiredObject(
  "A customer returned by the Fern API, with key fields normalized and the remaining upstream fields preserved.",
  {
    customerId: s.string("Unique identifier of the customer."),
    customerStatus: s.string("Current status of the customer."),
    customerType: s.string("Customer type returned by Fern."),
    email: s.email("Email address of the customer."),
    name: s.string("Full name of the customer or business."),
    verificationLink: s.url("URL for the KYC or KYB verification process."),
    updatedAt: timestampSchema,
    organizationId: s.string("Organization identifier."),
  },
  {
    optional: ["customerType", "email", "name", "verificationLink", "updatedAt", "organizationId"],
  },
);

const paymentAccountSchema = s.looseRequiredObject(
  "A payment account returned by the Fern API, with key fields normalized and the remaining upstream fields preserved.",
  {
    paymentAccountId: s.string("Identifier of the payment account returned by Fern."),
    paymentAccountType: s.string("Type of payment account."),
    paymentAccountStatus: s.string("Status of the payment account."),
    customerId: s.string("Customer ID that owns the payment account."),
    nickname: nullableStringSchema("Nickname for the payment account."),
    createdAt: timestampSchema,
    isThirdParty: s.boolean("Whether the payment account is a third-party account."),
  },
  {
    optional: ["customerId", "nickname", "createdAt", "isThirdParty"],
  },
);

const transactionSchema = s.looseRequiredObject(
  "A transaction returned by the Fern API, with key fields normalized and the remaining upstream fields preserved.",
  {
    transactionId: s.string("Unique identifier of the transaction."),
    customerId: s.string("Customer ID associated with the transaction."),
    quoteId: s.string("Quote ID used for the transaction."),
    transactionStatus: s.string("Current status of the transaction."),
    correlationId: s.string("Optional caller-provided correlation ID."),
    source: s.looseObject("Source transaction details returned by Fern.", {
      sourceCurrency: currencySchema,
      sourcePaymentMethod: s.string("Payment method for the source transaction."),
      sourceAmount: s.string("The amount sent from the source."),
    }),
    destination: s.looseObject("Destination transaction details returned by Fern.", {
      destinationCurrency: currencySchema,
      destinationPaymentMethod: s.string("Payment method for the destination transaction."),
      exchangeRate: s.string("Exchange rate used for the transaction."),
    }),
    fees: s.looseObject("Fee structure returned by Fern."),
  },
  {
    optional: ["quoteId", "correlationId", "source", "destination", "fees"],
  },
);

const feeComponentSchema = s.looseRequiredObject(
  "A fee component returned by Fern for an exchange rate.",
  {
    feeType: s.string("The type of fee component."),
    feeCurrency: currencySchema,
    feeAmount: s.string("Amount of the fee component."),
  },
  {
    optional: ["feeCurrency"],
  },
);

const exchangeRateSchema = s.looseRequiredObject(
  "An exchange rate and fee response returned by Fern.",
  {
    exchangeRate: s.string("The rate at which the source currency is multiplied to obtain the destination currency."),
    destinationAmount: s.string("Destination amount excluding Fern fees."),
    feeComponents: s.array("Fee components returned by Fern.", feeComponentSchema),
    fees: s.looseObject("Fee summary returned by Fern."),
  },
  {
    optional: ["destinationAmount", "fees"],
  },
);

const listCustomersInputSchema = s.object(
  "Input parameters for listing Fern customers.",
  {
    pageToken: pageTokenSchema,
    pageSize: pageSizeSchema,
    organizationId: s.uuid("Organization ID to filter customers."),
  },
  { optional: ["pageToken", "pageSize", "organizationId"] },
);

const getCustomerInputSchema = s.object(
  "Input parameters for retrieving a Fern customer.",
  {
    customerId: s.uuid("Unique identifier of the customer."),
    includeVerification: s.boolean("Whether to include verification details."),
    includePaymentMethods: s.boolean("Whether to include available payment methods in the response."),
  },
  {
    optional: ["includeVerification", "includePaymentMethods"],
  },
);

const listPaymentAccountsInputSchema = s.object(
  "Input parameters for listing Fern payment accounts.",
  {
    customerId: s.uuid("Customer to list payment accounts for."),
    pageToken: pageTokenSchema,
    pageSize: pageSizeSchema,
  },
  { optional: ["pageToken", "pageSize"] },
);

const getPaymentAccountInputSchema = s.object("Input parameters for retrieving a Fern payment account.", {
  paymentAccountId: s.uuid("Unique identifier of the payment account."),
});

const listTransactionsInputSchema = s.object(
  "Input parameters for listing Fern transactions.",
  {
    pageToken: pageTokenSchema,
    pageSize: pageSizeSchema,
    customerId: s.uuid("Customer to list transactions for."),
    paymentAccountId: s.uuid("Payment account to list transactions for."),
    organizationId: s.uuid("Organization to list transactions for."),
  },
  { optional: ["pageToken", "pageSize", "customerId", "paymentAccountId", "organizationId"] },
);

const getTransactionInputSchema = s.object("Input parameters for retrieving a Fern transaction.", {
  transactionId: s.uuid("Unique identifier of the transaction."),
});

const getExchangeRateInputSchema = s.object(
  "Input parameters for retrieving a Fern exchange rate.",
  {
    sourceCurrency: s.nonEmptyString("Currency label or contract address for the source currency."),
    sourcePaymentMethod: s.nonEmptyString("Payment method for the source exchange rate."),
    sourceAmount: s.nonEmptyString("Amount to be sent. When provided, Fern returns fees and destination amount."),
    destinationPaymentMethod: s.nonEmptyString("Payment method for the destination exchange rate."),
    destinationCurrency: s.nonEmptyString("Currency label or contract address for the destination currency."),
  },
  { optional: ["sourceAmount"] },
);

const paginatedCustomersOutputSchema = s.object(
  "A page of Fern customers.",
  {
    customers: s.array("Customers returned for the requested page.", customerSchema),
    nextPageToken: pageTokenSchema,
  },
  { optional: ["nextPageToken"] },
);

const paginatedPaymentAccountsOutputSchema = s.object(
  "A page of Fern payment accounts.",
  {
    paymentAccounts: s.array("Payment accounts returned for the requested page.", paymentAccountSchema),
    nextPageToken: pageTokenSchema,
  },
  { optional: ["nextPageToken"] },
);

const paginatedTransactionsOutputSchema = s.object(
  "A page of Fern transactions.",
  {
    transactions: s.array("Transactions returned for the requested page.", transactionSchema),
    nextPageToken: pageTokenSchema,
  },
  { optional: ["nextPageToken"] },
);

export const fernActions: Array<ProviderActionDefinition<FernActionName>> = [
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Fern customers with optional organization filtering and cursor pagination.",
    requiredScopes: ["customers:read"],
    inputSchema: listCustomersInputSchema,
    outputSchema: paginatedCustomersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve one Fern customer by ID.",
    requiredScopes: ["customers:read"],
    inputSchema: getCustomerInputSchema,
    outputSchema: customerSchema,
  }),
  defineProviderAction(service, {
    name: "list_payment_accounts",
    description: "List Fern payment accounts for a customer with cursor pagination.",
    requiredScopes: ["payment_accounts:read"],
    inputSchema: listPaymentAccountsInputSchema,
    outputSchema: paginatedPaymentAccountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_payment_account",
    description: "Retrieve one Fern payment account by ID.",
    requiredScopes: ["payment_accounts:read"],
    inputSchema: getPaymentAccountInputSchema,
    outputSchema: paymentAccountSchema,
  }),
  defineProviderAction(service, {
    name: "get_exchange_rate",
    description: "Retrieve Fern exchange rate and fee details for source and destination currencies.",
    requiredScopes: ["exchange_rates:read"],
    inputSchema: getExchangeRateInputSchema,
    outputSchema: exchangeRateSchema,
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    description: "List Fern transactions with optional customer, payment account, and organization filters.",
    requiredScopes: ["transactions:read"],
    inputSchema: listTransactionsInputSchema,
    outputSchema: paginatedTransactionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_transaction",
    description: "Retrieve one Fern transaction by ID.",
    requiredScopes: ["transactions:read"],
    inputSchema: getTransactionInputSchema,
    outputSchema: transactionSchema,
  }),
];

export type FernActionName =
  | "list_customers"
  | "get_customer"
  | "list_payment_accounts"
  | "get_payment_account"
  | "get_exchange_rate"
  | "list_transactions"
  | "get_transaction";
