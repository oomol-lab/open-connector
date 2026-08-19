import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "retently";

const nonEmptyStringSchema = (description: string) => s.string(description, { minLength: 1 });

const pageSchema = s.positiveInteger("The current page number. Retently defaults to page 1.");
const limitSchema = s.positiveInteger("The maximum number of items to return. Retently allows up to 1,000.", {
  maximum: 1000,
});
const sortSchema = nonEmptyStringSchema("The Retently sort option. Prefix the field with '-' for descending order.");
const dateOrTimestampSchema = nonEmptyStringSchema(
  "The date boundary as an ISO timestamp or UNIX timestamp accepted by Retently.",
);

const attributeFilterSchema = s.object(
  "A Retently customer attribute filter.",
  {
    name: nonEmptyStringSchema("The Retently customer property name to filter by."),
    op: nonEmptyStringSchema("The Retently filter operator, such as equal or not_equal."),
    value: nonEmptyStringSchema("The Retently customer property value to compare."),
  },
  { required: ["name", "op", "value"] },
);

const matchSchema = s.stringEnum("How Retently should combine multiple attribute filters.", ["all", "any"]);

const rawObjectSchema = s.looseObject("The raw object returned by Retently.");
const nullableRawObjectSchema = s.nullable(rawObjectSchema);

const paginationSchema = s.object(
  "Pagination metadata returned by Retently when present.",
  {
    page: s.nullable(s.integer("The current page number returned by Retently.")),
    pages: s.nullable(s.integer("The total number of pages returned by Retently.")),
    limit: s.nullable(s.integer("The page size returned by Retently.")),
    sort: s.nullable(s.string("The Retently sort value returned in the response.")),
    total: s.nullable(s.integer("The total number of matching records returned by Retently.")),
  },
  { required: ["page", "pages", "limit", "sort", "total"] },
);

const customerPropertySchema = s.object(
  "A Retently customer property to create or update.",
  {
    label: nonEmptyStringSchema("The display label for the Retently customer property."),
    type: s.stringEnum("The Retently customer property type.", ["string", "date", "integer", "collection", "boolean"]),
    value: s.unknown("The value to store for this Retently customer property."),
    name: nonEmptyStringSchema("The internal Retently customer property name."),
  },
  { required: ["label", "type", "value"], optional: ["name"] },
);

const customerUpsertSchema = s.object(
  "A Retently customer to create or update.",
  {
    email: s.email("The customer's email address."),
    first_name: nonEmptyStringSchema("The customer's first name."),
    last_name: nonEmptyStringSchema("The customer's last name."),
    company: nonEmptyStringSchema("The customer's company name."),
    tags: s.array("Retently tags to assign to the customer.", nonEmptyStringSchema("A Retently customer tag."), {
      minItems: 1,
    }),
    properties: s.array("Retently customer properties to create or update.", customerPropertySchema, {
      minItems: 1,
    }),
    unset_properties: s.array(
      "Retently property names or labels to remove from the customer.",
      nonEmptyStringSchema("A Retently property name or label to remove."),
      { minItems: 1 },
    ),
    unset_tags: s.array(
      "Retently tag names to remove from the customer.",
      nonEmptyStringSchema("A Retently tag to remove."),
      {
        minItems: 1,
      },
    ),
  },
  {
    required: ["email"],
    optional: ["first_name", "last_name", "company", "tags", "properties", "unset_properties", "unset_tags"],
  },
);

const listCustomersInputSchema = s.object(
  "The input payload for listing Retently customers.",
  {
    email: s.email("Find a customer by email address."),
    page: pageSchema,
    limit: limitSchema,
    sort: sortSchema,
    startDate: dateOrTimestampSchema,
    endDate: dateOrTimestampSchema,
    attributes: s.array("Retently customer property filters.", attributeFilterSchema, { minItems: 1 }),
    match: matchSchema,
  },
  { required: [], optional: ["email", "page", "limit", "sort", "startDate", "endDate", "attributes", "match"] },
);

const listFeedbackInputSchema = s.object(
  "The input payload for listing Retently feedback responses.",
  {
    email: s.email("Search feedback responses by customer email address."),
    customerId: nonEmptyStringSchema("Search feedback responses by Retently customer ID."),
    campaignId: nonEmptyStringSchema("Filter feedback responses by Retently campaign ID."),
    page: pageSchema,
    limit: limitSchema,
    sort: sortSchema,
    startDate: dateOrTimestampSchema,
    endDate: dateOrTimestampSchema,
    attributes: s.array("Retently customer property filters.", attributeFilterSchema, { minItems: 1 }),
    match: matchSchema,
  },
  {
    required: [],
    optional: [
      "email",
      "customerId",
      "campaignId",
      "page",
      "limit",
      "sort",
      "startDate",
      "endDate",
      "attributes",
      "match",
    ],
  },
);

const accountStatusOutputSchema = s.object(
  "The response returned when getting Retently account status.",
  {
    account: nullableRawObjectSchema,
    plan: nullableRawObjectSchema,
    usage: nullableRawObjectSchema,
    cache: nullableRawObjectSchema,
    raw: rawObjectSchema,
  },
  { required: ["account", "plan", "usage", "cache", "raw"] },
);

const listCustomersOutputSchema = s.object(
  "The response returned when listing Retently customers.",
  {
    customers: s.array("The customers returned by Retently.", rawObjectSchema),
    pagination: paginationSchema,
    raw: rawObjectSchema,
  },
  { required: ["customers", "pagination", "raw"] },
);

const getCustomerOutputSchema = s.object(
  "The response returned when getting a Retently customer.",
  {
    customer: nullableRawObjectSchema,
    raw: rawObjectSchema,
  },
  { required: ["customer", "raw"] },
);

const listFeedbackOutputSchema = s.object(
  "The response returned when listing Retently feedback.",
  {
    feedback: s.array("The feedback responses returned by Retently.", rawObjectSchema),
    pagination: paginationSchema,
    raw: rawObjectSchema,
  },
  { required: ["feedback", "pagination", "raw"] },
);

const getFeedbackOutputSchema = s.object(
  "The response returned when getting Retently feedback.",
  {
    feedback: nullableRawObjectSchema,
    raw: rawObjectSchema,
  },
  { required: ["feedback", "raw"] },
);

const listTemplatesOutputSchema = s.object(
  "The response returned when listing Retently templates.",
  {
    templates: s.array("The survey templates returned by Retently.", rawObjectSchema),
    raw: rawObjectSchema,
  },
  { required: ["templates", "raw"] },
);

const getTemplateOutputSchema = s.object(
  "The response returned when getting a Retently template.",
  {
    template: nullableRawObjectSchema,
    raw: rawObjectSchema,
  },
  { required: ["template", "raw"] },
);

const listCampaignsOutputSchema = s.object(
  "The response returned when listing Retently campaigns.",
  {
    campaigns: s.array("The campaigns returned by Retently.", rawObjectSchema),
    raw: rawObjectSchema,
  },
  { required: ["campaigns", "raw"] },
);

const upsertCustomersOutputSchema = s.object(
  "The response returned when creating or updating Retently customers.",
  {
    customers: s.array("The customers returned by Retently.", rawObjectSchema),
    pagination: paginationSchema,
    raw: rawObjectSchema,
  },
  { required: ["customers", "pagination", "raw"] },
);

export const retentlyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_status",
    description:
      "Get Retently account identity, plan, survey credit, and usage counters for the authenticated API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting Retently account status.", {}, { required: [] }),
    outputSchema: accountStatusOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Retently customers with optional email, pagination, sorting, date range, and attribute filters.",
    requiredScopes: [],
    inputSchema: listCustomersInputSchema,
    outputSchema: listCustomersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Get a Retently customer by customer ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for getting a Retently customer.",
      {
        customerId: nonEmptyStringSchema("The Retently customer ID."),
      },
      { required: ["customerId"] },
    ),
    outputSchema: getCustomerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_feedback",
    description:
      "List Retently survey feedback responses with optional customer, campaign, pagination, date, and attribute filters.",
    requiredScopes: [],
    inputSchema: listFeedbackInputSchema,
    outputSchema: listFeedbackOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_feedback",
    description: "Get a Retently feedback response by feedback ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for getting Retently feedback.",
      {
        feedbackId: nonEmptyStringSchema("The Retently feedback ID."),
      },
      { required: ["feedbackId"] },
    ),
    outputSchema: getFeedbackOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List Retently survey templates.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Retently templates.", {}, { required: [] }),
    outputSchema: listTemplatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_template",
    description:
      "Get a Retently survey template by template ID, including survey questions when Retently returns them.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for getting a Retently template.",
      {
        templateId: nonEmptyStringSchema("The Retently template ID."),
      },
      { required: ["templateId"] },
    ),
    outputSchema: getTemplateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Retently survey campaigns.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Retently campaigns.", {}, { required: [] }),
    outputSchema: listCampaignsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_customers",
    description: "Create or update Retently customers in bulk, including tags, properties, and fields to unset.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for creating or updating Retently customers.",
      {
        subscribers: s.array("Retently customers to create or update.", customerUpsertSchema, {
          minItems: 1,
          maxItems: 1000,
        }),
      },
      { required: ["subscribers"] },
    ),
    outputSchema: upsertCustomersOutputSchema,
  }),
];
