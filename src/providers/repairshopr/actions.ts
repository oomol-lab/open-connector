import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "repairshopr";

const nonEmptyString = (description: string) => s.string({ minLength: 1, description });
const idSchema = s.positiveInteger("RepairShopr numeric record identifier.");
const pageSchema = s.positiveInteger("Returns the provided page of results; each page contains 25 results.");
const rawObjectSchema = s.looseObject("Raw RepairShopr object returned by the API.");
const metaSchema = s.looseObject("RepairShopr pagination metadata returned by list endpoints.", {
  total_pages: s.integer("Total number of pages available."),
  total_entries: s.integer("Total number of entries available."),
  per_page: s.integer("Number of entries returned per page."),
  page: s.integer("Current page number."),
});
const customerListInputSchema = s.object(
  "Input filters for listing RepairShopr customers.",
  {
    sort: nonEmptyString('A customer field to order by, such as "firstname ASC" or "city DESC".'),
    query: nonEmptyString("Search query for matching customers."),
    firstname: nonEmptyString("Filter customers with a first name like this value."),
    lastname: nonEmptyString("Filter customers with a last name like this value."),
    business_name: nonEmptyString("Filter customers with a business name like this value."),
    email: nonEmptyString("Filter customers by email address."),
    page: pageSchema,
  },
  {
    optional: ["sort", "query", "firstname", "lastname", "business_name", "email", "page"],
  },
);
const ticketListInputSchema = s.object(
  "Input filters for listing RepairShopr tickets.",
  {
    customer_id: s.positiveInteger("Filter tickets by customer ID."),
    contact_id: s.positiveInteger("Filter tickets by contact ID."),
    number: nonEmptyString("Filter tickets by ticket number."),
    resolved_after: nonEmptyString('Return tickets resolved after this date, such as "2019-01-23".'),
    created_after: nonEmptyString('Return tickets created after this date, such as "2019-02-25".'),
    since_updated_at: nonEmptyString('Return tickets updated after this date, such as "2019-02-25".'),
    status: nonEmptyString('Filter tickets by status, such as "New", "In Progress", "Resolved", or "Not Closed".'),
    query: nonEmptyString("Search query for matching tickets."),
    user_id: s.positiveInteger("Filter tickets assigned to a RepairShopr user ID."),
    mine: s.boolean("Filter tickets assigned to the current user."),
    ticket_search_id: s.positiveInteger("Return results from a saved RepairShopr ticket search."),
    asset_name: nonEmptyString("Filter tickets linked to assets whose name matches this value."),
    asset_serial: nonEmptyString("Filter tickets linked to assets whose serial number matches this value."),
    page: pageSchema,
    comment_format: s.stringEnum("Format to use for ticket comments in the response.", [
      "plaintext",
      "richtext",
      "original",
    ]),
    all_comments: s.boolean("Include all ticket comments when supported by RepairShopr."),
  },
  {
    optional: [
      "customer_id",
      "contact_id",
      "number",
      "resolved_after",
      "created_after",
      "since_updated_at",
      "status",
      "query",
      "user_id",
      "mine",
      "ticket_search_id",
      "asset_name",
      "asset_serial",
      "page",
      "comment_format",
      "all_comments",
    ],
  },
);

export const repairshoprActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the current RepairShopr API user and account details.",
    inputSchema: s.object("Input for retrieving the current RepairShopr user.", {}, { required: [] }),
    outputSchema: s.looseObject("Current RepairShopr user object returned by the API."),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "Return a paginated list of RepairShopr customers.",
    inputSchema: customerListInputSchema,
    outputSchema: s.object(
      "Paginated RepairShopr customers response.",
      {
        customers: s.array("Customers returned by RepairShopr.", rawObjectSchema),
        meta: metaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve a RepairShopr customer by ID.",
    inputSchema: s.object("Input for retrieving a RepairShopr customer.", { id: idSchema }, { required: ["id"] }),
    outputSchema: s.object(
      "RepairShopr customer response.",
      {
        customer: rawObjectSchema,
      },
      { required: ["customer"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_tickets",
    description: "Return a paginated list of RepairShopr tickets.",
    inputSchema: ticketListInputSchema,
    outputSchema: s.object(
      "Paginated RepairShopr tickets response.",
      {
        tickets: s.array("Tickets returned by RepairShopr.", rawObjectSchema),
        meta: metaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    description: "Retrieve a RepairShopr ticket by ID.",
    inputSchema: s.object("Input for retrieving a RepairShopr ticket.", { id: idSchema }, { required: ["id"] }),
    outputSchema: s.object(
      "RepairShopr ticket response.",
      {
        ticket: rawObjectSchema,
      },
      { required: ["ticket"] },
    ),
  }),
];
