import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "simplesat" as const;

const requiredIdSchema = (description: string) => s.string(description, { minLength: 1 });
const pageSchema = s.integer("The one-based page number to request from Simplesat.", {
  minimum: 1,
});
const pageSizeSchema = (description: string, maximum: number) =>
  s.integer(description, {
    minimum: 1,
    maximum,
  });
const dateTimeSchema = (description: string) => s.dateTime(description);
const tagListSchema = s.array(
  "Tags associated with the Simplesat record.",
  s.string("One Simplesat tag.", { minLength: 1 }),
);
const customAttributesSchema = s.record(
  "Custom attributes keyed by Simplesat attribute name.",
  s.unknown("A JSON value for the custom attribute."),
);
const nullablePageUrlSchema = s.nullable(
  s.string("A Simplesat pagination URL, or null when that page is not available."),
);
const externalIdOutputSchema = s.nullable(
  s.anyOf("The external identifier returned by Simplesat.", [
    s.string("The external identifier as a string."),
    s.integer("The external identifier as a number."),
  ]),
);

const paginationFields = {
  page: pageSchema,
  pageSize: pageSizeSchema("The number of records to request per page.", 100),
} as const;

const pageOptionalFields = ["page", "pageSize"] as const;

const surveySchema = s.looseObject("A Simplesat survey object.", {
  id: s.integer("The Simplesat survey ID."),
  name: s.string("The survey name."),
  metric: s.string("The survey metric, such as CSAT, NPS, or CES."),
  survey_token: s.string("The Simplesat survey token."),
  survey_type: s.string("The Simplesat survey type."),
  brand_name: s.string("The survey brand name."),
});

const questionSchema = s.looseObject("A Simplesat question object.", {
  id: s.integer("The Simplesat question ID."),
  text: s.string("The question text."),
  metric: s.string("The question metric."),
  order: s.integer("The question display order."),
  rating_scale: s.boolean("Whether the question uses a rating scale."),
  required: s.boolean("Whether answering this question is required."),
  survey: s.looseObject("The survey that owns this question."),
  choices: s.array("The answer choices configured for this question.", s.string("One answer choice.")),
  rules: s.array(
    "Conditional display rules configured for this question.",
    s.looseObject("One Simplesat question rule."),
  ),
});

const responseSchema = s.looseObject("A Simplesat survey response object.", {
  id: s.integer("The Simplesat response ID."),
  survey: s.looseObject("The survey metadata returned with this response."),
  tags: tagListSchema,
  created: s.string("The timestamp when this response was created."),
  modified: s.string("The timestamp when this response was last modified."),
  customer: s.looseObject("The customer metadata returned with this response."),
  answers: s.array("The answers included in this response.", s.looseObject("One answer object.")),
});

const customerSchema = s.looseObject("A Simplesat customer object.", {
  id: s.integer("The Simplesat customer ID."),
  external_id: externalIdOutputSchema,
  name: s.string("The customer name."),
  email: s.email("The customer email address."),
  company: s.string("The customer company name."),
  language: s.string("The customer's language code."),
  tags: tagListSchema,
  custom_attributes: customAttributesSchema,
  created: s.string("The timestamp when this customer was created."),
  modified: s.string("The timestamp when this customer was last modified."),
  subscribed: s.boolean("Whether this customer is subscribed."),
});

const paginatedSurveysOutputSchema = s.object("A page of Simplesat surveys.", {
  next: nullablePageUrlSchema,
  previous: nullablePageUrlSchema,
  count: s.integer("The total number of surveys matching the query."),
  surveys: s.array("The surveys returned on this page.", surveySchema),
});

const paginatedQuestionsOutputSchema = s.object("A page of Simplesat questions.", {
  next: nullablePageUrlSchema,
  previous: nullablePageUrlSchema,
  count: s.integer("The total number of questions matching the query."),
  questions: s.array("The questions returned on this page.", questionSchema),
});

const paginatedResponsesOutputSchema = s.object("A page of Simplesat responses.", {
  next: nullablePageUrlSchema,
  previous: nullablePageUrlSchema,
  count: s.integer("The total number of responses matching the query."),
  responses: s.array("The responses returned on this page.", responseSchema),
});

const paginatedCustomersOutputSchema = s.object("A page of Simplesat customers.", {
  next: nullablePageUrlSchema,
  previous: nullablePageUrlSchema,
  count: s.integer("The total number of customers matching the query."),
  customers: s.array("The customers returned on this page.", customerSchema),
});

const responseFilterSchema = s.object(
  "A documented Simplesat response search filter.",
  {
    key: s.string(
      "The response field to filter on, such as customer.email, survey, tag, ticket_id, or customer.attribute.",
      { minLength: 1 },
    ),
    comparison: s.stringEnum("The comparison operator to apply to this response filter.", [
      "is",
      "is_not",
      "contains",
      "does_not_contain",
      "is_unknown",
      "has_any_value",
    ]),
    values: s.array(
      "The values to compare against when the comparison operator expects values.",
      s.string("One response filter value."),
      { minItems: 1 },
    ),
    attribute: s.string("The custom attribute name when key is customer.attribute or ticket.attribute.", {
      minLength: 1,
    }),
  },
  { optional: ["values", "attribute"] },
);

const customerMutationFields = {
  externalId: s.string("The customer identifier from an external system.", { minLength: 1 }),
  email: s.email("The customer email address."),
  name: s.string("The customer full name.", { minLength: 1 }),
  company: s.string("The customer company name.", { minLength: 1 }),
  language: s.string("The customer language code.", { minLength: 1 }),
  tags: tagListSchema,
  customAttributes: customAttributesSchema,
} as const;

const sendSurveyCustomerSchema = s.object(
  "The customer who should receive the survey email.",
  {
    id: s.string("The customer identifier from an external system.", { minLength: 1 }),
    email: s.email("The customer email address that should receive the survey."),
    name: s.string("The customer full name.", { minLength: 1 }),
    company: s.string("The customer company name.", { minLength: 1 }),
    language: s.string("The customer language code.", { minLength: 1 }),
    customAttributes: customAttributesSchema,
  },
  { optional: ["id", "name", "company", "language", "customAttributes"] },
);

const sendSurveyTeamMemberSchema = s.object(
  "The team member metadata to associate with the survey email.",
  {
    id: s.string("The team member identifier from an external system.", { minLength: 1 }),
    email: s.email("The team member email address."),
    name: s.string("The team member full name.", { minLength: 1 }),
    customAttributes: customAttributesSchema,
  },
  { optional: ["id", "email", "name", "customAttributes"] },
);

const sendSurveyTicketSchema = s.object(
  "The ticket metadata to associate with the survey email.",
  {
    id: s.string("The ticket identifier from an external system.", { minLength: 1 }),
    subject: s.string("The ticket subject.", { minLength: 1 }),
    customAttributes: customAttributesSchema,
  },
  { optional: ["id", "subject", "customAttributes"] },
);

const listSurveysAction = defineProviderAction(service, {
  name: "list_surveys",
  description: "List one page of Simplesat surveys.",
  requiredScopes: [],
  inputSchema: s.object("Filters for listing Simplesat surveys.", paginationFields, {
    optional: pageOptionalFields,
  }),
  outputSchema: paginatedSurveysOutputSchema,
});

const listQuestionsAction = defineProviderAction(service, {
  name: "list_questions",
  description: "List one page of Simplesat questions with optional survey and metric filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing Simplesat questions.",
    {
      ...paginationFields,
      surveyId: s.integer("Filter questions by Simplesat survey ID.", { minimum: 1 }),
      metric: s.string("Filter questions by metric, such as csat, nps, or ces.", {
        minLength: 1,
      }),
    },
    { optional: [...pageOptionalFields, "surveyId", "metric"] },
  ),
  outputSchema: paginatedQuestionsOutputSchema,
});

const searchResponsesAction = defineProviderAction(service, {
  name: "search_responses",
  description: "Search one page of Simplesat survey responses with documented date and field filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for searching Simplesat responses.",
    {
      ...paginationFields,
      startDate: dateTimeSchema("Legacy response search start timestamp accepted by Simplesat."),
      endDate: dateTimeSchema("Legacy response search end timestamp accepted by Simplesat."),
      createdStartDate: dateTimeSchema("Filter responses created on or after this timestamp."),
      createdEndDate: dateTimeSchema("Filter responses created on or before this timestamp."),
      modifiedStartDate: dateTimeSchema("Filter responses modified on or after this timestamp."),
      modifiedEndDate: dateTimeSchema("Filter responses modified on or before this timestamp."),
      operator: s.stringEnum("How Simplesat should combine multiple response filters.", ["and", "or"]),
      filters: s.array("Response filters to apply.", responseFilterSchema, { minItems: 1 }),
    },
    {
      optional: [
        ...pageOptionalFields,
        "startDate",
        "endDate",
        "createdStartDate",
        "createdEndDate",
        "modifiedStartDate",
        "modifiedEndDate",
        "operator",
        "filters",
      ],
    },
  ),
  outputSchema: paginatedResponsesOutputSchema,
});

const getResponseAction = defineProviderAction(service, {
  name: "get_response",
  description: "Get a single Simplesat survey response by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The response lookup input.",
    {
      responseId: requiredIdSchema("The Simplesat response ID to retrieve."),
    },
    { required: ["responseId"] },
  ),
  outputSchema: responseSchema,
});

const listCustomersAction = defineProviderAction(service, {
  name: "list_customers",
  description: "List one page of Simplesat customers with optional date and subscription filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for listing Simplesat customers.",
    {
      page: pageSchema,
      pageSize: pageSizeSchema("The number of customers to request per page.", 250),
      createdAfter: dateTimeSchema("Filter customers created after this timestamp."),
      createdBefore: dateTimeSchema("Filter customers created before this timestamp."),
      modifiedAfter: dateTimeSchema("Filter customers modified after this timestamp."),
      modifiedBefore: dateTimeSchema("Filter customers modified before this timestamp."),
      subscribed: s.boolean("Filter customers by subscription status."),
    },
    {
      optional: ["page", "pageSize", "createdAfter", "createdBefore", "modifiedAfter", "modifiedBefore", "subscribed"],
    },
  ),
  outputSchema: paginatedCustomersOutputSchema,
});

const getCustomerAction = defineProviderAction(service, {
  name: "get_customer",
  description: "Get a single Simplesat customer by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The customer lookup input.",
    {
      customerId: requiredIdSchema("The Simplesat customer ID to retrieve."),
    },
    { required: ["customerId"] },
  ),
  outputSchema: customerSchema,
});

const createOrUpdateCustomerAction = defineProviderAction(service, {
  name: "create_or_update_customer",
  description: "Create or update a Simplesat customer by email, overwriting tags or custom attributes when provided.",
  requiredScopes: [],
  inputSchema: s.object("The customer fields to create or update in Simplesat.", customerMutationFields, {
    optional: ["externalId", "name", "company", "language", "tags", "customAttributes"],
  }),
  outputSchema: customerSchema,
});

const sendSurveyEmailAction = defineProviderAction(service, {
  name: "send_survey_email",
  description:
    "Schedule a Simplesat event-based survey email for a customer with optional team member and ticket metadata.",
  requiredScopes: [],
  inputSchema: s.object(
    "The survey email scheduling payload.",
    {
      surveyToken: requiredIdSchema("The event-based Simplesat survey token to send."),
      customer: sendSurveyCustomerSchema,
      teamMember: sendSurveyTeamMemberSchema,
      ticket: sendSurveyTicketSchema,
    },
    { optional: ["teamMember", "ticket"] },
  ),
  outputSchema: s.object("The Simplesat survey email scheduling response.", {
    detail: s.string("The scheduling status message returned by Simplesat."),
  }),
});

export const simplesatActions: ActionDefinition[] = [
  listSurveysAction,
  listQuestionsAction,
  searchResponsesAction,
  getResponseAction,
  listCustomersAction,
  getCustomerAction,
  createOrUpdateCustomerAction,
  sendSurveyEmailAction,
];
