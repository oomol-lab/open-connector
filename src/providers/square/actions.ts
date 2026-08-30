import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "square" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const cursorSchema = nonEmptyString("Cursor token returned by a previous Square page.");
const customerIdSchema = nonEmptyString("The Square customer ID.");
const idempotencyKeySchema = nonEmptyString("A unique key that makes the Square write request idempotent.");

const customerSortFieldSchema = s.stringEnum("The Square customer list sort field.", ["DEFAULT", "CREATED_AT"]);

const limitSchema = s.integer("Maximum number of records to return. Square allows 1 to 100.", {
  minimum: 1,
  maximum: 100,
});

const squareAddressSchema = s.looseObject("A Square address object.", {
  address_line_1: s.string("The first line of the address."),
  address_line_2: s.string("The second line of the address."),
  address_line_3: s.string("The third line of the address."),
  locality: s.string("The city or locality."),
  sublocality: s.string("The neighborhood or sublocality."),
  administrative_district_level_1: s.string("The first-level administrative district."),
  postal_code: s.string("The postal code."),
  country: s.string("The country code."),
});

const squareCoordinatesSchema = s.looseObject("Square geographic coordinates.", {
  latitude: s.number("The latitude coordinate."),
  longitude: s.number("The longitude coordinate."),
});

const squareBusinessHoursPeriodSchema = s.looseObject("A Square business-hours period.", {
  day_of_week: s.string("The day of week for the period."),
  start_local_time: s.string("The local opening time."),
  end_local_time: s.string("The local closing time."),
});

const squareBusinessHoursSchema = s.looseObject("Square business hours.", {
  periods: s.array("Business-hour periods returned by Square.", squareBusinessHoursPeriodSchema),
});

const squareLocationSchema = s.looseObject("A Square location object.", {
  id: s.string("The Square location ID."),
  name: s.string("The Square location name."),
  address: squareAddressSchema,
  timezone: s.string("The IANA timezone for the location."),
  capabilities: s.array("Capabilities enabled for the location.", s.string("A location capability.")),
  status: s.string("The Square location status."),
  created_at: s.string("The time when Square created the location."),
  merchant_id: s.string("The Square merchant ID."),
  country: s.string("The location country code."),
  language_code: s.string("The location language code."),
  currency: s.string("The location currency code."),
  phone_number: s.string("The location phone number."),
  business_name: s.string("The public business name for the location."),
  type: s.string("The Square location type."),
  description: s.string("The location description."),
  coordinates: squareCoordinatesSchema,
  business_hours: squareBusinessHoursSchema,
  mcc: s.string("The merchant category code."),
});

const squareCustomerPreferencesSchema = s.looseObject("Square customer preferences.", {
  email_unsubscribed: s.boolean("Whether the customer is unsubscribed from marketing email."),
});

const squareTaxIdsSchema = s.looseObject("Square customer tax IDs.", {
  eu_vat: s.string("The customer's EU VAT ID."),
});

const squareCustomerSchema = s.looseObject("A Square customer profile.", {
  id: s.string("The Square customer ID."),
  created_at: s.string("The time when Square created the customer."),
  updated_at: s.string("The time when Square last updated the customer."),
  cards: s.array("Cards associated with the customer.", s.looseObject("A Square card object.")),
  given_name: s.string("The customer's given name."),
  family_name: s.string("The customer's family name."),
  nickname: s.string("The customer's nickname."),
  company_name: s.string("The customer's company name."),
  email_address: s.string("The customer's email address."),
  address: squareAddressSchema,
  phone_number: s.string("The customer's phone number."),
  birthday: s.string("The customer's birthday in Square format."),
  reference_id: s.string("The merchant-defined customer reference ID."),
  note: s.string("The merchant-defined note for the customer."),
  preferences: squareCustomerPreferencesSchema,
  creation_source: s.string("The Square customer creation source."),
  group_ids: s.array("Customer group IDs returned by Square.", s.string("A Square customer group ID.")),
  segment_ids: s.array("Customer segment IDs returned by Square.", s.string("A Square customer segment ID.")),
  tax_ids: squareTaxIdsSchema,
  version: s.integer("The Square customer version for optimistic concurrency."),
});

const customerInputSchema = s.looseObject("Square customer fields to send in the request body.", {
  given_name: s.string("The customer's given name."),
  family_name: s.string("The customer's family name."),
  company_name: s.string("The customer's company name."),
  nickname: s.string("The customer's nickname."),
  email_address: s.string("The customer's email address."),
  address: squareAddressSchema,
  phone_number: s.string("The customer's phone number."),
  reference_id: s.string("The merchant-defined customer reference ID."),
  note: s.string("The merchant-defined note for the customer."),
  birthday: s.string("The customer's birthday in Square format."),
  tax_ids: squareTaxIdsSchema,
  version: s.integer("The Square customer version for optimistic concurrency."),
});

const createCustomerFieldsSchema = {
  ...customerInputSchema,
  anyOf: [
    { required: ["given_name"] },
    { required: ["family_name"] },
    { required: ["company_name"] },
    { required: ["email_address"] },
    { required: ["phone_number"] },
  ],
};

const customerSearchQuerySchema = s.looseObject("Square customer search query.", {
  filter: s.looseObject("Square customer search filters."),
  sort: s.looseObject("Square customer search sort options."),
});

const emptyInputSchema = s.object("No input is required.", {});

const listCustomersInputSchema = s.object(
  "Query parameters for listing Square customers.",
  {
    cursor: cursorSchema,
    limit: limitSchema,
    sort_field: customerSortFieldSchema,
  },
  { optional: ["cursor", "limit", "sort_field"] },
);

const getCustomerInputSchema = s.object("Path parameters for retrieving a Square customer.", {
  customer_id: customerIdSchema,
});

const createCustomerInputSchema = s.object(
  "Request body for creating a Square customer.",
  {
    customer: createCustomerFieldsSchema,
    idempotency_key: idempotencyKeySchema,
  },
  { optional: ["idempotency_key"] },
);

const updateCustomerInputSchema = s.object("Request body for updating a Square customer.", {
  customer_id: customerIdSchema,
  customer: customerInputSchema,
});

const searchCustomersInputSchema = s.object(
  "Request body for searching Square customers.",
  {
    query: customerSearchQuerySchema,
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["query", "limit", "cursor"] },
);

const listLocationsOutputSchema = s.object("Square locations response.", {
  locations: s.array("Locations returned by Square.", squareLocationSchema),
});

const customerPageOutputSchema = s.object("Paginated Square customers response.", {
  customers: s.array("Customers returned by Square.", squareCustomerSchema),
  cursor: s.nullable(s.string("Cursor returned by Square, when another page is available.")),
  nextCursor: s.nullable(s.string("Cursor to pass into the next request, when one is available.")),
});

const customerOutputSchema = s.object("Square customer response.", {
  customer: squareCustomerSchema,
});

export const squareActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_locations",
    description: "List Square seller locations for the connected access token.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: listLocationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Square customer profiles with cursor pagination.",
    requiredScopes: [],
    inputSchema: listCustomersInputSchema,
    outputSchema: customerPageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve one Square customer profile by ID.",
    requiredScopes: [],
    inputSchema: getCustomerInputSchema,
    outputSchema: customerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_customer",
    description: "Create a Square customer profile.",
    requiredScopes: [],
    inputSchema: createCustomerInputSchema,
    outputSchema: customerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_customer",
    description: "Update a Square customer profile by ID.",
    requiredScopes: [],
    inputSchema: updateCustomerInputSchema,
    outputSchema: customerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_customers",
    description: "Search Square customer profiles with supported Square filters.",
    requiredScopes: [],
    inputSchema: searchCustomersInputSchema,
    outputSchema: customerPageOutputSchema,
  }),
];
