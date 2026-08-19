import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "one_page_crm";

const idField = (description: string) => s.nonEmptyString(description);

const paginationInput = {
  page: s.positiveInteger("Page number to request. OnePageCRM starts pagination at 1."),
  perPage: s.integer("Number of records to return per page. OnePageCRM allows at most 100.", {
    minimum: 1,
    maximum: 100,
  }),
};

const paginationOutput = {
  totalCount: s.integer("Total number of matching records reported by OnePageCRM."),
  page: s.integer("Current page number returned by OnePageCRM."),
  perPage: s.integer("Number of records returned per page by OnePageCRM."),
  maxPage: s.integer("Last available page number reported by OnePageCRM."),
};

const typedValueSchema = s.requiredObject(
  "A typed value accepted by OnePageCRM for email addresses, phone numbers, or URLs.",
  {
    type: s.nonEmptyString("OnePageCRM type for this value, such as work, home, website, or other."),
    value: s.nonEmptyString("The typed value stored on the contact."),
  },
);

const contactFields = {
  title: s.stringEnum("Title of the contact.", ["Mr", "Mrs", "Ms"]),
  firstName: s.string("First name of the contact.", { minLength: 1, maxLength: 25 }),
  lastName: s.string("Last name of the contact.", { minLength: 1, maxLength: 25 }),
  jobTitle: s.string("Job title of the contact.", { minLength: 1, maxLength: 1000 }),
  starred: s.boolean("Whether the contact should be starred."),
  companyId: idField("ID of the company to which the contact belongs."),
  companyName: s.string("Name of the company to which the contact belongs.", { minLength: 1, maxLength: 55 }),
  urls: s.array("URLs associated with the contact.", typedValueSchema),
  phones: s.array("Phone numbers associated with the contact.", typedValueSchema),
  emails: s.array("Email addresses associated with the contact.", typedValueSchema),
  statusId: idField("ID of the status assigned to the contact."),
  tags: s.array("Tags assigned to the contact.", s.nonEmptyString("One contact tag.")),
  leadSourceId: idField("ID of the lead source assigned to the contact."),
  background: s.string("Background information about the contact.", { minLength: 1, maxLength: 10240 }),
  ownerId: idField("ID of the OnePageCRM user who owns the contact."),
};

const dealFields = {
  contactId: idField("ID of the contact to which the deal belongs."),
  ownerId: idField("ID of the OnePageCRM user who owns the deal."),
  pipelineId: idField("ID of the pipeline to which the deal belongs."),
  salesPipelineId: idField("ID of the sales pipeline to which the deal belongs."),
  name: s.string("Name of the deal.", { minLength: 1, maxLength: 60 }),
  text: s.string("Extra notes related to the deal.", { minLength: 1, maxLength: 7168 }),
  stage: s.integer("Progress stage for a pending deal. OnePageCRM uses 0 through 100.", {
    minimum: 0,
    maximum: 100,
  }),
  status: s.stringEnum("Status of the deal.", ["pending", "won", "lost"]),
  expectedCloseDate: s.date("Date the pending deal is expected to close."),
  closeDate: s.date("Date the won or lost deal actually closed."),
  date: s.date("Creation date of the deal."),
  amount: s.number("Monetary value of the deal."),
  months: s.positiveInteger("Number of months the deal is paid for."),
  cost: s.number("Monetary cost of the deal."),
  commissionBase: s.stringEnum("Commission calculation base.", ["amount", "margin"]),
  commissionType: s.stringEnum("Commission type.", ["none", "percentage", "fixed"]),
  commission: s.number("Fixed commission value for the deal."),
  commissionPercentage: s.number("Commission percentage for the deal."),
};

const contactRecordSchema = s.looseObject("OnePageCRM contact object.");
const dealRecordSchema = s.looseObject("OnePageCRM deal object.");
const rawResponseSchema = s.looseObject("Raw OnePageCRM response payload.");

const listContactsInputSchema = s.object(
  "Filters and pagination for listing OnePageCRM contacts.",
  {
    ...paginationInput,
    search: s.nonEmptyString("Search contacts by contact name, company name, or phone number."),
    ownerId: idField("Return contacts owned by a specific OnePageCRM user."),
    tag: s.nonEmptyString("Filter contacts by tag."),
    filterId: idField("Apply a saved OnePageCRM contact filter."),
    sortBy: s.stringEnum("Field used to sort OnePageCRM contacts.", [
      "created_at",
      "modified_at",
      "first_name",
      "last_name",
      "company_name",
      "name",
    ]),
    order: s.stringEnum("Sort order for OnePageCRM contact results.", ["asc", "desc"]),
  },
  {
    optional: ["page", "perPage", "search", "ownerId", "tag", "filterId", "sortBy", "order"],
  },
);

const listDealsInputSchema = s.object(
  "Filters and pagination for listing OnePageCRM deals.",
  {
    ...paginationInput,
    search: s.nonEmptyString("Search deals by deal name, contact name, or company name."),
    status: s.stringEnum("Return deals with a particular status.", ["pending", "won", "lost", "closed"]),
    stage: s.integer("Return pending deals at a specific stage.", {
      minimum: 0,
      maximum: 100,
    }),
    ownerId: idField("Return deals owned by a specific OnePageCRM user."),
    contactId: idField("Return deals linked to a specific contact."),
    companyId: idField("Return deals linked to a specific company."),
    tag: s.nonEmptyString("Filter deals by tag."),
    filterId: idField("Apply a saved OnePageCRM deal filter."),
    sortBy: s.stringEnum("Field used to sort OnePageCRM deals.", [
      "created_at",
      "modified_at",
      "date",
      "close_date",
      "expected_close_date",
    ]),
    order: s.stringEnum("Sort order for OnePageCRM deal results.", ["asc", "desc"]),
  },
  {
    optional: [
      "page",
      "perPage",
      "search",
      "status",
      "stage",
      "ownerId",
      "contactId",
      "companyId",
      "tag",
      "filterId",
      "sortBy",
      "order",
    ],
  },
);

export const onePageCrmActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List OnePageCRM contacts with pagination, search, ownership, tag, and sorting filters.",
    inputSchema: listContactsInputSchema,
    outputSchema: s.object(
      "Normalized OnePageCRM contact list response.",
      {
        contacts: s.array("Contacts returned by OnePageCRM.", contactRecordSchema),
        ...paginationOutput,
        raw: rawResponseSchema,
      },
      {
        optional: ["totalCount", "page", "perPage", "maxPage"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve a single OnePageCRM contact by ID.",
    inputSchema: s.requiredObject("Identifier for getting a OnePageCRM contact.", {
      contactId: idField("ID of the OnePageCRM contact to retrieve."),
    }),
    outputSchema: s.requiredObject("Normalized OnePageCRM contact response.", {
      contact: contactRecordSchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a OnePageCRM contact using JSON-safe contact fields.",
    inputSchema: s.object("Fields for creating a OnePageCRM contact.", contactFields, {
      optional: Object.keys(contactFields),
    }),
    outputSchema: s.requiredObject("Normalized OnePageCRM contact response.", {
      contact: contactRecordSchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_deals",
    description: "List OnePageCRM deals with pagination, search, status, contact, owner, tag, and sorting filters.",
    inputSchema: listDealsInputSchema,
    outputSchema: s.object(
      "Normalized OnePageCRM deal list response.",
      {
        deals: s.array("Deals returned by OnePageCRM.", dealRecordSchema),
        ...paginationOutput,
        raw: rawResponseSchema,
      },
      {
        optional: ["totalCount", "page", "perPage", "maxPage"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_deal",
    description: "Retrieve a single OnePageCRM deal by ID.",
    inputSchema: s.requiredObject("Identifier for getting a OnePageCRM deal.", {
      dealId: idField("ID of the OnePageCRM deal to retrieve."),
    }),
    outputSchema: s.requiredObject("Normalized OnePageCRM deal response.", {
      deal: dealRecordSchema,
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_deal",
    description: "Create a OnePageCRM deal using JSON-safe deal fields.",
    inputSchema: s.object("Fields for creating a OnePageCRM deal.", dealFields, {
      optional: [
        "pipelineId",
        "salesPipelineId",
        "text",
        "stage",
        "status",
        "expectedCloseDate",
        "closeDate",
        "date",
        "amount",
        "months",
        "cost",
        "commissionBase",
        "commissionType",
        "commission",
        "commissionPercentage",
      ],
    }),
    outputSchema: s.requiredObject("Normalized OnePageCRM deal response.", {
      deal: dealRecordSchema,
      raw: rawResponseSchema,
    }),
  }),
];
