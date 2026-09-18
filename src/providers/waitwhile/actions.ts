import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "waitwhile";

const locationId = s.string("Identifier of location.", { pattern: "^[a-zA-Z0-9]{20}$" });
const customerId = s.string("Identifier of customer.", { pattern: "^[a-zA-Z0-9]{22}$" });
const limit = s.integer("Maximum number of results, from 1 to 100; defaults to 20.", {
  minimum: 1,
  maximum: 100,
});
const cursor = s.string("Comma-separated pagination values; pass the previous endAt as startAfter.");
const date = s.anyOf("Date and time in ISO-8601 format or milliseconds from epoch.", [
  s.string("Date and time in ISO-8601 format.", { format: "date-time" }),
  s.integer("Milliseconds from epoch."),
]);
const tag = s.stringEnum("Tag associated with a visit.", [
  "NO-SHOW",
  "CANCELLED",
  "REMOVED",
  "ALERTED",
  "ARRIVED",
  "DELAYED",
  "CONFIRMED",
  "EXPIRED",
  "FLAGGED",
  "IMPORTED",
  "PRIORITIZED",
  "CAPACITY",
  "REJECTED",
]);
const customerFields = {
  name: s.nullable(s.string("Customer name.", { maxLength: 100 })),
  firstName: s.nullable(s.string("First name of customer.", { maxLength: 100 })),
  lastName: s.nullable(s.string("Last name of customer.", { maxLength: 100 })),
  phone: s.nullable(s.string("Phone number in E.164 format.")),
  email: s.nullable(s.string("Email address.", { maxLength: 100 })),
  notes: s.nullable(
    s.string("Legacy customer notes; deprecated upstream in favor of customer note entries.", {
      maxLength: 1000,
    }),
  ),
  tags: s.array("Customer tags.", tag, { maxItems: 10, uniqueItems: true }),
  locationIds: s.array("Location identifiers.", locationId, { uniqueItems: true }),
  addTags: s.array("Tags to add to existing tags.", tag, { maxItems: 10, uniqueItems: true }),
  removeTags: s.array("Tags to remove from existing tags.", tag, {
    maxItems: 10,
    uniqueItems: true,
  }),
  metadata: s.nullable({
    ...s.record(
      "Up to 20 metadata keys, each at most 40 characters, with string values up to 500 characters.",
      s.string("Metadata value.", { maxLength: 500 }),
    ),
    maxProperties: 20,
    propertyNames: { maxLength: 40 },
  }),
};
const externalId = s.nullable(
  s.string("External customer identifier; takes priority over contact information when deriving the customer ID.", {
    maxLength: 100,
  }),
);
const customer = s.looseRequiredObject(
  "Customer returned by Waitwhile, including additional upstream fields.",
  {
    id: s.string("Customer identifier."),
    name: s.nullable(s.string("Customer name.")),
    externalId: s.nullable(s.string("External customer identifier.")),
    email: s.nullable(s.string("Customer email address.")),
    phone: s.nullable(s.string("Customer phone number.")),
  },
  { optional: ["id", "name", "externalId", "email", "phone"] },
);
const customerPage = s.looseRequiredObject(
  "One page of customers with cursor pagination.",
  {
    results: s.array("Customers in this page.", customer),
    limit,
    startAt: cursor,
    endAt: cursor,
  },
  { optional: ["limit", "startAt", "endAt"] },
);
const filters = { locationId, fromDate: date, toDate: date };

export const waitwhileActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_locations",
    operationType: "read",
    description: "List accessible Waitwhile locations with cursor pagination.",
    inputSchema: s.object(
      "Location list filters and pagination.",
      {
        limit,
        startAfter: cursor,
        desc: s.boolean("Return results in descending order."),
        externalId: s.nullable(s.string("External location identifier.", { maxLength: 100 })),
        countryCode: s.string("Two-letter uppercase country code.", { pattern: "^[A-Z]{2}$" }),
      },
      { optional: ["limit", "startAfter", "desc", "externalId", "countryCode"] },
    ),
    outputSchema: s.looseRequiredObject(
      "One page of locations with cursor pagination.",
      {
        results: s.array(
          "Locations in this page.",
          s.looseRequiredObject(
            "Location settings and contact information.",
            {
              id: s.string("Location identifier."),
              name: s.string("Location name."),
            },
            { optional: ["id", "name"] },
          ),
        ),
        limit,
        startAt: cursor,
        endAt: cursor,
      },
      { optional: ["limit", "startAt", "endAt"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Waitwhile customers with location, external ID, date filters and cursor pagination.",
    inputSchema: s.object(
      "Customer list filters and pagination.",
      {
        limit,
        startAfter: cursor,
        desc: s.boolean("Return results in descending order."),
        ...filters,
        externalId,
      },
      { required: [] },
    ),
    outputSchema: customerPage,
  }),
  defineProviderAction(service, {
    name: "search_customers",
    operationType: "read",
    description: "Search Waitwhile customers by name, phone, email or identifier prefix with page-number pagination.",
    inputSchema: s.object(
      "Customer search filters and pagination.",
      {
        ...filters,
        q: s.string("Prefix to match against name, phone, email or customer identifier.", {
          maxLength: 100,
        }),
        state: s.stringEnum("Visit state to filter by.", [
          "PENDING",
          "DRAFT",
          "BOOKED",
          "WAITING",
          "SERVING",
          "COMPLETE",
        ]),
        tag,
        limit,
        page: s.integer("Page number, starting at 1.", { minimum: 1, maximum: 1000000 }),
      },
      { required: [] },
    ),
    outputSchema: s.looseRequiredObject(
      "One page of customer search results.",
      {
        results: s.array("Matching customers in this page.", customer),
        limit,
        page: s.integer("Current page number."),
      },
      { optional: ["limit", "page"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_customer",
    operationType: "write",
    description: "Create a Waitwhile customer with contact information, location associations, tags and metadata.",
    inputSchema: s.object("Customer creation request.", {
      customer: s.object(
        "Customer fields to create.",
        { ...customerFields, externalId },
        { optional: Object.keys(customerFields) },
      ),
    }),
    outputSchema: customer,
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve one Waitwhile customer by ID.",
    inputSchema: s.object("Customer lookup request.", { customerId }),
    outputSchema: customer,
  }),
  defineProviderAction(service, {
    name: "update_customer",
    operationType: "destructive",
    description:
      "Update a Waitwhile customer's contact information, location associations, tags or metadata; nullable fields can be cleared.",
    inputSchema: s.object("Customer update request.", {
      customerId,
      customer: s.object("Customer fields to update; omitted fields remain unchanged.", customerFields, {
        required: [],
      }),
    }),
    outputSchema: customer,
  }),
  defineProviderAction(service, {
    name: "delete_customer",
    operationType: "destructive",
    description: "Delete a Waitwhile customer by ID.",
    inputSchema: s.object("Customer deletion request.", { customerId }),
    outputSchema: s.looseRequiredObject(
      "Waitwhile deletion status response.",
      {
        statusCode: s.integer("HTTP status code reported by Waitwhile."),
        message: s.string("Message describing the result."),
      },
      { optional: ["statusCode", "message"] },
    ),
  }),
];
