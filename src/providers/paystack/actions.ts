import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "paystack";

const metadataSchema = s.record("Metadata object sent to or returned by Paystack.", s.unknown("A metadata value."));

const customerSchema = s.looseObject("A Paystack customer object.", {
  id: s.integer("Unique Paystack customer ID."),
  email: s.email("Customer email address."),
  customer_code: s.string("Paystack customer code."),
  first_name: s.string("Customer first name."),
  last_name: s.string("Customer last name."),
  phone: s.string("Customer phone number."),
  metadata: metadataSchema,
});

const paginationMetaSchema = s.looseObject("Pagination metadata returned by Paystack.", {
  total: s.integer("Total records available."),
  perPage: s.integer("Records returned per page."),
  page: s.integer("Current page number."),
  pageCount: s.integer("Total page count."),
  next: s.nullableString("Next page cursor or URL when provided."),
  previous: s.nullableString("Previous page cursor or URL when provided."),
});

const transactionSchema = s.looseObject("A Paystack transaction object.", {
  id: s.integer("Unique Paystack transaction ID."),
  status: s.string("Transaction status returned by Paystack."),
  reference: s.string("Paystack transaction reference."),
  amount: s.integer("Transaction amount in the smallest currency unit."),
  currency: s.string("Transaction currency code."),
  gateway_response: s.string("Gateway response message returned by Paystack."),
  channel: s.string("Payment channel used for the transaction."),
  paid_at: s.nullableString("Timestamp when the transaction was paid."),
  created_at: s.string("Timestamp when the transaction was created."),
  metadata: metadataSchema,
});

const listInputProperties = {
  page: s.positiveInteger("Page number to fetch."),
  perPage: s.positiveInteger("Number of records to return per page.", { maximum: 100 }),
  from: s.string("Inclusive ISO 8601 start timestamp used to filter creation time."),
  to: s.string("Inclusive ISO 8601 end timestamp used to filter creation time."),
};

const customerPayloadProperties = {
  email: s.email("Customer email address."),
  first_name: s.string("Customer first name."),
  last_name: s.string("Customer last name."),
  phone: s.string("Customer phone number."),
  metadata: metadataSchema,
};

const updateCustomerInputSchema = {
  ...s.object(
    "The input payload for updating a Paystack customer.",
    {
      code: s.nonEmptyString("Customer code used in the Paystack update path."),
      ...customerPayloadProperties,
    },
    { optional: ["first_name", "last_name", "phone", "metadata"] },
  ),
  anyOf: [
    { required: ["first_name"] },
    { required: ["last_name"] },
    { required: ["phone"] },
    { required: ["metadata"] },
  ],
};

export const paystackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a customer in Paystack.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating a Paystack customer.", customerPayloadProperties, {
      optional: ["first_name", "last_name", "phone", "metadata"],
    }),
    outputSchema: s.object("The Paystack customer create response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List customers available in Paystack.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Paystack customers.", listInputProperties, {
      optional: ["page", "perPage", "from", "to"],
    }),
    outputSchema: s.object(
      "The paginated Paystack customer list response.",
      {
        customers: s.array("Customers returned by Paystack.", customerSchema),
        meta: paginationMetaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Fetch a customer in Paystack by email address or customer code.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching a Paystack customer.", {
      email_or_code: s.nonEmptyString("Customer email address or customer code accepted by Paystack."),
    }),
    outputSchema: s.object("The Paystack customer detail response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_customer",
    description: "Update a Paystack customer by customer code.",
    requiredScopes: [],
    inputSchema: updateCustomerInputSchema,
    outputSchema: s.object("The Paystack customer update response.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "initialize_transaction",
    description: "Initialize a Paystack transaction and return checkout details.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for initializing a Paystack transaction.",
      {
        email: s.email("Customer email address used for the transaction."),
        amount: s.positiveInteger("Transaction amount in the smallest currency unit."),
        currency: s.string("Transaction currency code."),
        reference: s.string("Custom transaction reference."),
        callback_url: s.string("Callback URL used after checkout completes."),
        metadata: metadataSchema,
      },
      { optional: ["currency", "reference", "callback_url", "metadata"] },
    ),
    outputSchema: s.object("The Paystack checkout initialization response.", {
      authorization_url: s.string("Checkout authorization URL returned by Paystack."),
      access_code: s.string("Access code returned by Paystack."),
      reference: s.string("Transaction reference returned by Paystack."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    description: "List transactions available in Paystack.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Paystack transactions.",
      {
        ...listInputProperties,
        status: s.string("Transaction status filter."),
        customer: s.string("Customer code filter."),
      },
      { optional: ["page", "perPage", "status", "customer", "from", "to"] },
    ),
    outputSchema: s.object(
      "The paginated Paystack transaction list response.",
      {
        transactions: s.array("Transactions returned by Paystack.", transactionSchema),
        meta: paginationMetaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_transaction",
    description: "Fetch a Paystack transaction by transaction ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for fetching a Paystack transaction.", {
      id: s.positiveInteger("Paystack transaction ID."),
    }),
    outputSchema: s.object("The Paystack transaction detail response.", {
      transaction: transactionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "verify_transaction",
    description: "Verify a Paystack transaction by reference.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for verifying a Paystack transaction.", {
      reference: s.nonEmptyString("Transaction reference used by Paystack verify."),
    }),
    outputSchema: s.object("The Paystack transaction verify response.", {
      transaction: transactionSchema,
    }),
  }),
];
