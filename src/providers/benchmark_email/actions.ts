import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "benchmark_email";

const benchmarkStatusSchema = s.stringEnum("The status code returned by Benchmark Email for this response wrapper.", [
  "1",
  "-1",
]);
const contactSearchTypeSchema = s.stringEnum("The search match mode used when filtering contacts in a list.", [
  "1",
  "2",
  "3",
  "4",
]);
const contactFilterSchema = s.stringEnum("The predefined contact subset filter returned by Benchmark Email.", [
  "2",
  "5",
  "100",
]);
const contactOrderBySchema = s.stringEnum("The contact field used for sorting list results.", [
  "email",
  "firstname",
  "lastname",
  "date",
]);
const sortOrderSchema = s.stringEnum("The sort direction used for contact list results.", ["asc", "desc"]);

const accountSummaryOutputSchema = s.object(
  "The Benchmark Email account summary response.",
  {
    FreePlan: s.integer("Whether the account is on the free plan: 1 for free, 0 for paid."),
    Limit: s.integer("The total image storage limit available for the account."),
  },
  { required: ["FreePlan", "Limit"] },
);

const contactListSummaryDataSchema = s.object(
  "The contact list summary metrics returned by Benchmark Email.",
  {
    TotalContacts: s.integer("The total number of contacts in the list."),
    ActiveContacts: s.integer("The number of active contacts in the list."),
    BouncedContacts: s.integer("The number of bounced contacts in the list."),
    PendingContacts: s.integer("The number of pending contacts in the list."),
    UnsubscribedContacts: s.integer("The number of unsubscribed contacts in the list."),
  },
  { optional: ["TotalContacts", "ActiveContacts", "BouncedContacts", "PendingContacts", "UnsubscribedContacts"] },
);

const contactListSummaryOutputSchema = s.object(
  "The contact list summary wrapper returned by Benchmark Email.",
  {
    Status: benchmarkStatusSchema,
    Data: contactListSummaryDataSchema,
  },
  { optional: ["Data"] },
);

const contactListItemSchema = s.object(
  "A single contact record returned from a Benchmark Email contact list query.",
  {
    ID: s.string("The unique contact entry identifier in the list."),
    Email: s.string("The contact email address."),
    ReSend: s.string("The Benchmark Email resend indicator or action token."),
    LastName: s.string("The contact last name."),
    EmailType: s.string("The email type classification returned by Benchmark Email."),
    FirstName: s.string("The contact first name."),
    MiddleName: s.string("The contact middle name."),
    CreatedDate: s.string("The date when the contact was created."),
    UpdatedDate: s.string("The date when the contact was last updated."),
    ContactMasterID: s.string("The Benchmark Email master contact identifier."),
  },
  {
    optional: [
      "ID",
      "Email",
      "ReSend",
      "LastName",
      "EmailType",
      "FirstName",
      "MiddleName",
      "CreatedDate",
      "UpdatedDate",
      "ContactMasterID",
    ],
  },
);

const contactsInListOutputSchema = s.object(
  "The paginated contacts wrapper returned by Benchmark Email.",
  {
    Status: benchmarkStatusSchema,
    Count: s.integer("The total number of contacts matching the current list query."),
    Data: s.array("The contacts returned for the current page.", contactListItemSchema),
  },
  { optional: ["Count", "Data"] },
);

const contactDetailsDataSchema = s.looseObject(
  "The detailed contact payload returned by Benchmark Email, including standard and custom field values.",
  {
    ID: s.string("The unique contact identifier in the list."),
    Email: s.string("The contact email address."),
    Status: s.string("The contact status code returned by Benchmark Email."),
    FirstName: s.string("The contact first name."),
    LastName: s.string("The contact last name."),
    MiddleName: s.string("The contact middle name."),
    EmailType: s.string("The email type classification returned by Benchmark Email."),
    ContactMasterID: s.string("The Benchmark Email master contact identifier."),
    Optin: s.string("The contact opt-in status."),
    EmailPerm: s.string("The email permission flag returned by Benchmark Email."),
    Rating: s.string("The contact rating score."),
  },
);

const contactDetailsOutputSchema = s.object(
  "The detailed contact wrapper returned by Benchmark Email.",
  {
    Status: benchmarkStatusSchema,
    Data: contactDetailsDataSchema,
  },
  { optional: ["Data"] },
);

export const benchmarkEmailActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_summary",
    description: "Get the current Benchmark Email account summary and image storage plan details.",
    inputSchema: s.object({}, { description: "This action does not require any input." }),
    outputSchema: accountSummaryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contacts_in_list",
    description:
      "Get paginated contacts from a Benchmark Email list with optional search, filter, and sorting parameters.",
    inputSchema: s.object(
      "The input payload for reading paginated contacts from a Benchmark Email list.",
      {
        list_id: s.nonEmptyString("The contact list identifier to query."),
        language: s.nonEmptyString(
          "The Benchmark Email language code forwarded to listGetFilteredContacts when needed.",
        ),
        filter: contactFilterSchema,
        order_by: contactOrderBySchema,
        sort_order: sortOrderSchema,
        page_size: s.integer("The number of contacts to return per page.", { minimum: 1 }),
        page_number: s.integer("The page number to return, starting at 1.", { minimum: 1 }),
        search_type: contactSearchTypeSchema,
        search_field: s.nonEmptyString("The field name to search, such as email or firstname."),
        search_filter: s.nonEmptyString("The text filter to apply when searching within contacts."),
      },
      {
        optional: [
          "language",
          "filter",
          "order_by",
          "sort_order",
          "page_size",
          "page_number",
          "search_type",
          "search_field",
          "search_filter",
        ],
      },
    ),
    outputSchema: contactsInListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_details",
    description: "Get detailed information for a specific Benchmark Email contact email within a specific list.",
    inputSchema: s.object(
      "The input payload for reading a single contact from a Benchmark Email list.",
      {
        list_id: s.nonEmptyString("The contact list identifier that contains the contact."),
        email: s.email("The email address of the contact to look up within the list."),
      },
      { required: ["list_id", "email"] },
    ),
    outputSchema: contactDetailsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_list_summary",
    description:
      "Get summary counts for a Benchmark Email contact list, including active, bounced, pending, and unsubscribed contacts.",
    inputSchema: s.object(
      "The input payload for reading Benchmark Email contact list summary metrics.",
      {
        list_id: s.nonEmptyString("The contact list identifier to summarize."),
      },
      { required: ["list_id"] },
    ),
    outputSchema: contactListSummaryOutputSchema,
  }),
];

export type BenchmarkEmailActionName = (typeof benchmarkEmailActions)[number]["name"];
