import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chartmogul";

const cursorSchema = s.nonEmptyString("The cursor returned by ChartMogul for fetching the next page.");
const perPageSchema = s.integer("The maximum number of records to return. ChartMogul caps this at 200.", {
  minimum: 1,
  maximum: 200,
});
const customerUuidSchema = s.nonEmptyString("The ChartMogul UUID of the customer.");

const paginationOutputSchema = {
  cursor: s.nullableString("The cursor to use for the next page when ChartMogul returns one."),
  hasMore: s.boolean("Whether ChartMogul reports more records after this page."),
};

const accountSchema = s.object("A normalized ChartMogul account object.", {
  uuid: s.nullableString("The ChartMogul account UUID."),
  name: s.nullableString("The account name returned by ChartMogul."),
  currency: s.nullableString("The account ISO 4217 currency code."),
  timeZone: s.nullableString("The account time zone identifier."),
  weekStartOn: s.nullableString("The first day of the week configured for the account."),
  raw: s.looseObject("The raw account object returned by ChartMogul."),
});

const dataSourceSchema = s.object("A normalized ChartMogul data source.", {
  uuid: s.nullableString("The ChartMogul UUID for the source."),
  name: s.nullableString("The source name."),
  system: s.nullableString("The billing system type for the source."),
  createdAt: s.nullableString("The time when the source was created."),
  status: s.nullableString("The current source status."),
  raw: s.looseObject("The raw data source object returned by ChartMogul."),
});

const customerSchema = s.object("A normalized ChartMogul customer.", {
  uuid: s.nullableString("The ChartMogul UUID for the customer."),
  externalId: s.nullableString("The primary external customer identifier."),
  externalIds: s.array(
    "All external customer identifiers returned by ChartMogul.",
    s.string("One external customer identifier."),
  ),
  dataSourceUuid: s.nullableString("The source UUID for the customer."),
  dataSourceUuids: s.array("All source UUIDs associated with the customer.", s.string("One source UUID.")),
  name: s.nullableString("The customer name when returned by ChartMogul."),
  email: s.nullableString("The customer email when returned by ChartMogul."),
  status: s.nullableString("The combined lead or subscription status."),
  company: s.nullableString("The customer company name."),
  country: s.nullableString("The customer country code."),
  state: s.nullableString("The customer state or region."),
  city: s.nullableString("The customer city."),
  customerSince: s.nullableString("The time when the customer first became a customer."),
  mrr: s.nullableNumber("The current monthly recurring revenue in the account currency subunit."),
  arr: s.nullableNumber("The current annual recurring revenue in the account currency subunit."),
  currency: s.nullableString("The customer currency code."),
  chartmogulUrl: s.nullableString("The ChartMogul app URL for the customer."),
  billingSystemUrl: s.nullableString("The upstream billing system URL for the customer."),
  raw: s.looseObject("The raw customer object returned by ChartMogul."),
});

const contactSchema = s.object("A normalized ChartMogul contact.", {
  uuid: s.nullableString("The ChartMogul UUID for the contact."),
  customerUuid: s.nullableString("The ChartMogul UUID of the owning customer."),
  customerExternalId: s.nullableString("The external ID of the owning customer."),
  dataSourceUuid: s.nullableString("The source UUID for the contact."),
  externalId: s.nullableString("The external contact identifier."),
  firstName: s.nullableString("The contact first name."),
  lastName: s.nullableString("The contact last name."),
  title: s.nullableString("The contact job title."),
  email: s.nullableString("The contact email address."),
  phone: s.nullableString("The contact phone number."),
  linkedIn: s.nullableString("The contact LinkedIn URL."),
  twitter: s.nullableString("The contact Twitter or X URL."),
  position: s.nullableInteger("The contact position value returned by ChartMogul."),
  raw: s.looseObject("The raw contact object returned by ChartMogul."),
});

export const chartmogulActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve basic ChartMogul account settings for the authenticated API key.",
    inputSchema: s.object(
      "Input parameters for retrieving ChartMogul account settings.",
      {
        include: s.array(
          "Additional account settings to include in the response.",
          s.stringEnum("One supported ChartMogul account setting include value.", [
            "churn_recognition",
            "churn_when_zero_mrr",
            "auto_churn_subscription",
            "refund_handling",
            "proximate_movement_reclassification",
          ]),
          { minItems: 1 },
        ),
      },
      { optional: ["include"] },
    ),
    outputSchema: s.object("The response returned when retrieving ChartMogul account details.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_sources",
    description: "List ChartMogul data sources with optional source name or billing system filters.",
    inputSchema: s.object(
      "Input parameters for listing ChartMogul data sources.",
      {
        name: s.nonEmptyString("The source name to filter by."),
        system: s.nonEmptyString("The billing system type to filter by, such as Stripe, Recurly, or Custom."),
      },
      { optional: ["name", "system"] },
    ),
    outputSchema: s.object("The response returned when listing ChartMogul data sources.", {
      dataSources: s.array("The data sources returned by ChartMogul.", dataSourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List ChartMogul customers with cursor pagination and common customer filters.",
    inputSchema: s.object(
      "Input parameters for listing ChartMogul customers.",
      {
        dataSourceUuid: s.nonEmptyString("The ChartMogul source UUID used to filter customers."),
        externalId: s.nonEmptyString("The external customer identifier to filter by."),
        email: s.nonEmptyString("The customer email address to search for."),
        withAssociatedEmails: s.boolean("Whether email search should also match associated contact email addresses."),
        status: s.nonEmptyString("The lead or subscription status to filter by."),
        system: s.nonEmptyString("The billing system to filter by, such as Stripe, Recurly, or Custom."),
        cursor: cursorSchema,
        perPage: perPageSchema,
      },
      {
        optional: [
          "dataSourceUuid",
          "externalId",
          "email",
          "withAssociatedEmails",
          "status",
          "system",
          "cursor",
          "perPage",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing ChartMogul customers.", {
      customers: s.array("The customers returned by ChartMogul.", customerSchema),
      ...paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve a single ChartMogul customer by customer UUID.",
    inputSchema: s.object("Input parameters for retrieving a ChartMogul customer.", {
      customerUuid: customerUuidSchema,
    }),
    outputSchema: s.object("The response returned when retrieving a ChartMogul customer.", {
      customer: customerSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List ChartMogul contacts with cursor pagination and common contact filters.",
    inputSchema: s.object(
      "Input parameters for listing ChartMogul contacts.",
      {
        email: s.nonEmptyString("The contact email address to filter by."),
        customerExternalId: s.nonEmptyString("The customer external identifier whose contacts should be returned."),
        customerUuid: customerUuidSchema,
        dataSourceUuid: s.nonEmptyString("The source UUID whose contacts should be returned."),
        cursor: cursorSchema,
        perPage: perPageSchema,
      },
      {
        optional: ["email", "customerExternalId", "customerUuid", "dataSourceUuid", "cursor", "perPage"],
      },
    ),
    outputSchema: s.object("The response returned when listing ChartMogul contacts.", {
      contacts: s.array("The contacts returned by ChartMogul.", contactSchema),
      ...paginationOutputSchema,
    }),
  }),
];
