import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { surveyMonkeyConnectorScopes } from "./scopes.ts";

const service = "survey_monkey" as const;

const noInputSchema = s.object("No input parameters are required for this action.", {});

const optionalPage = s.optional(s.integer("The 1-based page number to retrieve.", { minimum: 1 }));
const optionalPerPage = s.optional(
  s.integer("The maximum number of resources to return on this page.", {
    minimum: 1,
    maximum: 1000,
  }),
);
const optionalShortPerPage = s.optional(
  s.integer("The maximum number of resources to return on this page.", {
    minimum: 1,
    maximum: 100,
  }),
);

const linksSchema = s.looseObject("Pagination links returned by SurveyMonkey.", {
  self: s.optional(s.string("The URL of the current page.")),
  next: s.optional(s.string("The URL of the next page, when available.")),
  prev: s.optional(s.string("The URL of the previous page, when available.")),
});

const userSchema = s.looseObject("The authenticated SurveyMonkey user.", {
  id: s.nonEmptyString("The SurveyMonkey user identifier."),
  username: s.optional(s.string("The SurveyMonkey username.")),
  email: s.optional(s.string("The user email address.")),
  first_name: s.optional(s.string("The user first name.")),
  last_name: s.optional(s.string("The user last name.")),
  account_type: s.optional(s.string("The SurveyMonkey account plan type.")),
});

const surveySchema = s.looseObject("A SurveyMonkey survey.", {
  id: s.nonEmptyString("The survey identifier."),
  title: s.optional(s.string("The survey title.")),
  nickname: s.optional(s.string("The internal survey nickname.")),
  language: s.optional(s.string("The survey language code.")),
  href: s.optional(s.string("The API URL of the survey.")),
  date_created: s.optional(s.string("The timestamp when the survey was created.")),
  date_modified: s.optional(s.string("The timestamp when the survey was last modified.")),
  response_count: s.optional(s.integer("The number of survey responses.")),
  question_count: s.optional(s.integer("The number of survey questions.")),
  page_count: s.optional(s.integer("The number of survey pages.")),
});

const responseSchema = s.looseObject("A SurveyMonkey survey response.", {
  id: s.nonEmptyString("The response identifier."),
  survey_id: s.optional(s.string("The survey identifier associated with the response.")),
  collector_id: s.optional(s.string("The collector identifier associated with the response.")),
  response_status: s.optional(s.string("The response status.")),
  date_created: s.optional(s.string("The timestamp when the response was created.")),
  date_modified: s.optional(s.string("The timestamp when the response was last modified.")),
  pages: s.optional(
    s.array(
      "The response pages and answers returned by SurveyMonkey.",
      s.looseObject("One response page with provider-defined answer fields."),
    ),
  ),
});

const rollupSummarySchema = s.looseObject("The aggregate response summary for one SurveyMonkey question.", {
  answered: s.optional(s.nonNegativeInteger("The number of respondents who answered the question.")),
  skipped: s.optional(s.nonNegativeInteger("The number of respondents who skipped the question.")),
  other_answered: s.optional(s.nonNegativeInteger("The number of respondents who selected an other-answer option.")),
  stats: s.optional(s.unknown("Provider-defined basic statistics for supported closed-ended questions.")),
  choices: s.optional(s.unknown("Provider-defined answer choice identifiers and aggregate counts.")),
});

const rollupSchema = s.looseObject("The aggregate result for one SurveyMonkey question.", {
  id: s.nonEmptyString("The SurveyMonkey question identifier."),
  href: s.optional(s.url("The API URL of the question rollup.")),
  family: s.optional(s.string("The SurveyMonkey question family.")),
  subtype: s.optional(s.string("The SurveyMonkey question subtype.")),
  summary: s.optional(
    s.array("The aggregate answer counts and statistics returned for the question.", rollupSummarySchema),
  ),
});

const collectorSchema = s.looseObject("A SurveyMonkey survey collector.", {
  id: s.nonEmptyString("The collector identifier."),
  name: s.optional(s.string("The collector name.")),
  type: s.optional(s.string("The collector type.")),
  status: s.optional(s.string("The collector status.")),
  url: s.optional(s.string("The public collector URL, when available.")),
  href: s.optional(s.string("The API URL of the collector.")),
  response_count: s.optional(s.integer("The number of responses received by the collector.")),
});

const contactListSchema = s.looseObject("A SurveyMonkey contact list.", {
  id: s.nonEmptyString("The contact list identifier."),
  name: s.optional(s.string("The contact list name.")),
  href: s.optional(s.string("The API URL of the contact list.")),
});

const contactSchema = s.looseObject("A SurveyMonkey contact.", {
  id: s.nonEmptyString("The contact identifier."),
  email: s.optional(s.nullable(s.string("The contact email address when available."))),
  first_name: s.optional(s.string("The contact first name.")),
  last_name: s.optional(s.string("The contact last name.")),
  phone_number: s.optional(s.nullable(s.string("The contact phone number when available."))),
  href: s.optional(s.string("The API URL of the contact.")),
  custom_fields: s.optional(
    s.nullable(
      s.record("The custom field values keyed by SurveyMonkey field identifier.", s.string("A custom field value.")),
    ),
  ),
});

function paginatedOutput(description: string, itemDescription: string, itemSchema: Record<string, unknown>) {
  return s.object(description, {
    items: s.array(itemDescription, itemSchema),
    page: s.integer("The current page number."),
    perPage: s.integer("The number of resources requested per page."),
    total: s.integer("The total number of matching resources."),
    links: s.describe(linksSchema, "The pagination links returned by SurveyMonkey."),
  });
}

const listSurveysInputSchema = s.object("Filters for listing SurveyMonkey surveys.", {
  page: optionalPage,
  perPage: optionalPerPage,
  title: s.optional(s.nonEmptyString("A partial survey title to search for.")),
  folderId: s.optional(s.nonEmptyString("The folder identifier used to filter surveys.")),
  sortBy: s.optional(s.stringEnum("The field used to sort surveys.", ["title", "date_modified", "num_responses"])),
  sortOrder: s.optional(s.stringEnum("The survey sort direction.", ["ASC", "DESC"])),
  startModifiedAt: s.optional(s.string("Return surveys modified at or after this SurveyMonkey datetime value.")),
  endModifiedAt: s.optional(s.string("Return surveys modified at or before this SurveyMonkey datetime value.")),
});

const surveyIdInputSchema = s.object("The SurveyMonkey survey to retrieve.", {
  surveyId: s.nonEmptyString("The SurveyMonkey survey identifier."),
});

const createSurveyInputSchema = s.object("The blank SurveyMonkey survey to create.", {
  title: s.nonEmptyString("The title of the new survey."),
  nickname: s.optional(s.nonEmptyString("An internal nickname for the survey.")),
  language: s.optional(s.nonEmptyString("The survey language code, such as `en`.")),
  folderId: s.optional(s.nonEmptyString("The folder identifier where the survey will be created.")),
  footer: s.optional(s.boolean("Whether to display the SurveyMonkey footer.")),
});

const listResponsesInputSchema = s.object("Filters for listing survey responses.", {
  surveyId: s.nonEmptyString("The SurveyMonkey survey identifier."),
  page: optionalPage,
  perPage: optionalPerPage,
  status: s.optional(
    s.stringEnum("The response status to include.", ["completed", "partial", "overquota", "disqualified"]),
  ),
  startCreatedAt: s.optional(s.string("Return responses created at or after this SurveyMonkey datetime value.")),
  endCreatedAt: s.optional(s.string("Return responses created at or before this SurveyMonkey datetime value.")),
});

const listResponseDetailsInputSchema = s.object("Filters for listing detailed survey responses.", {
  surveyId: s.nonEmptyString("The SurveyMonkey survey identifier."),
  page: optionalPage,
  perPage: optionalShortPerPage,
  status: s.optional(
    s.stringEnum("The response status to include.", ["completed", "partial", "overquota", "disqualified"]),
  ),
  startCreatedAt: s.optional(s.string("Return responses created at or after this SurveyMonkey datetime value.")),
  endCreatedAt: s.optional(s.string("Return responses created at or before this SurveyMonkey datetime value.")),
});

const responseDetailsInputSchema = s.object("The survey response to retrieve.", {
  surveyId: s.nonEmptyString("The SurveyMonkey survey identifier."),
  responseId: s.nonEmptyString("The SurveyMonkey response identifier."),
});

const surveyRollupsInputSchema = s.object("Filters for aggregating SurveyMonkey responses by question.", {
  surveyId: s.nonEmptyString("The SurveyMonkey survey identifier."),
  collectorIds: s.optional(
    s.stringArray("Limit the aggregation to responses from these collector identifiers.", {
      minItems: 1,
      itemDescription: "A SurveyMonkey collector identifier.",
    }),
  ),
  status: s.optional(
    s.stringEnum("Limit the aggregation to responses with this status.", [
      "completed",
      "partial",
      "overquota",
      "disqualified",
    ]),
  ),
  startCreatedAt: s.optional(
    s.nonEmptyString("Include responses created at or after this SurveyMonkey datetime value."),
  ),
  endCreatedAt: s.optional(
    s.nonEmptyString("Include responses created at or before this SurveyMonkey datetime value."),
  ),
  startModifiedAt: s.optional(
    s.nonEmptyString("Include responses last modified at or after this SurveyMonkey datetime value."),
  ),
  endModifiedAt: s.optional(
    s.nonEmptyString("Include responses last modified at or before this SurveyMonkey datetime value."),
  ),
});

const listCollectorsInputSchema = s.object("Pagination for listing survey collectors.", {
  surveyId: s.nonEmptyString("The SurveyMonkey survey identifier."),
  page: optionalPage,
  perPage: optionalPerPage,
});

const createWeblinkCollectorInputSchema = s.object("The SurveyMonkey weblink collector to create.", {
  surveyId: s.nonEmptyString("The SurveyMonkey survey identifier."),
  name: s.optional(s.nonEmptyString("The collector name.")),
});

const paginationInputSchema = s.object("Pagination parameters for this resource list.", {
  page: optionalPage,
  perPage: optionalPerPage,
});

const createContactListInputSchema = s.object("The SurveyMonkey contact list to create.", {
  name: s.nonEmptyString("The contact list name."),
});

const listContactsInputSchema = s.object("Filters for listing SurveyMonkey contacts.", {
  page: optionalPage,
  perPage: optionalPerPage,
  status: s.optional(s.stringEnum("The contact delivery status to include.", ["active", "optout", "bounced"])),
  sortBy: s.optional(s.nonEmptyString("The contact field used for sorting.")),
  sortOrder: s.optional(s.stringEnum("The contact sort direction.", ["ASC", "DESC"])),
  search: s.optional(s.nonEmptyString("The text used to search contacts.")),
  searchBy: s.optional(s.nonEmptyString("The contact field used for searching.")),
});

const createContactInputSchema = s.requireAnyProperty(
  s.object("The SurveyMonkey contact to create.", {
    email: s.optional(s.email("The contact email address.")),
    firstName: s.optional(s.nonEmptyString("The contact first name.")),
    lastName: s.optional(s.nonEmptyString("The contact last name.")),
    phoneNumber: s.optional(s.nonEmptyString("The contact phone number.")),
    customFields: s.optional(
      s.record(
        "Custom contact field values keyed by SurveyMonkey field identifier.",
        s.string("A custom field value."),
      ),
    ),
  }),
  ["email", "phoneNumber"],
);

export const surveyMonkeyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the SurveyMonkey user and plan associated with the connected account.",
    requiredScopes: [surveyMonkeyConnectorScopes.usersRead],
    inputSchema: noInputSchema,
    outputSchema: s.object("The current SurveyMonkey user response.", {
      user: s.describe(userSchema, "The authenticated SurveyMonkey user."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_surveys",
    description: "List surveys available to the connected SurveyMonkey account.",
    requiredScopes: [surveyMonkeyConnectorScopes.surveysRead],
    inputSchema: listSurveysInputSchema,
    outputSchema: paginatedOutput(
      "The normalized paginated survey list.",
      "The surveys returned on this page.",
      surveySchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_survey_details",
    description: "Get a survey with its pages, questions, and answer choices.",
    requiredScopes: [surveyMonkeyConnectorScopes.surveysRead],
    inputSchema: surveyIdInputSchema,
    outputSchema: s.object("The expanded SurveyMonkey survey response.", {
      survey: s.describe(surveySchema, "The expanded survey returned by SurveyMonkey."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_survey",
    description: "Create a blank SurveyMonkey survey with one empty page.",
    requiredScopes: [surveyMonkeyConnectorScopes.surveysWrite],
    inputSchema: createSurveyInputSchema,
    outputSchema: s.object("The created SurveyMonkey survey response.", {
      survey: s.describe(surveySchema, "The survey created by SurveyMonkey."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_survey_responses",
    description: "List response metadata for a SurveyMonkey survey.",
    requiredScopes: [surveyMonkeyConnectorScopes.responsesRead],
    inputSchema: listResponsesInputSchema,
    outputSchema: paginatedOutput(
      "The normalized paginated survey response list.",
      "The survey responses returned on this page.",
      responseSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "list_survey_response_details",
    description: "List detailed SurveyMonkey responses including question answers.",
    requiredScopes: [surveyMonkeyConnectorScopes.responseDetailsRead],
    inputSchema: listResponseDetailsInputSchema,
    outputSchema: paginatedOutput(
      "The normalized paginated detailed response list.",
      "The detailed survey responses returned on this page.",
      responseSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_survey_response_details",
    description: "Get one SurveyMonkey response including its question answers.",
    requiredScopes: [surveyMonkeyConnectorScopes.responseDetailsRead],
    inputSchema: responseDetailsInputSchema,
    outputSchema: s.object("The detailed SurveyMonkey response.", {
      response: s.describe(responseSchema, "The requested detailed survey response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_survey_rollups",
    description: "Get aggregate answer counts and basic statistics for every question in a SurveyMonkey survey.",
    requiredScopes: [surveyMonkeyConnectorScopes.responseDetailsRead],
    inputSchema: surveyRollupsInputSchema,
    outputSchema: s.object("The SurveyMonkey question rollups.", {
      rollups: s.array("The aggregate results returned for the survey questions.", rollupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_collectors",
    description: "List collectors and distribution URLs for a SurveyMonkey survey.",
    requiredScopes: [surveyMonkeyConnectorScopes.collectorsRead],
    inputSchema: listCollectorsInputSchema,
    outputSchema: paginatedOutput(
      "The normalized paginated collector list.",
      "The collectors returned on this page.",
      collectorSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "create_weblink_collector",
    description: "Create a public weblink collector for a SurveyMonkey survey.",
    requiredScopes: [surveyMonkeyConnectorScopes.collectorsWrite],
    inputSchema: createWeblinkCollectorInputSchema,
    outputSchema: s.object("The created SurveyMonkey collector response.", {
      collector: s.describe(collectorSchema, "The weblink collector created by SurveyMonkey."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contact_lists",
    description: "List contact lists in the connected SurveyMonkey account.",
    requiredScopes: [surveyMonkeyConnectorScopes.contactsRead],
    inputSchema: paginationInputSchema,
    outputSchema: paginatedOutput(
      "The normalized paginated contact list collection.",
      "The contact lists returned on this page.",
      contactListSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "create_contact_list",
    description: "Create a SurveyMonkey contact list for survey recipients.",
    requiredScopes: [surveyMonkeyConnectorScopes.contactsWrite],
    inputSchema: createContactListInputSchema,
    outputSchema: s.object("The created SurveyMonkey contact list response.", {
      contactList: s.describe(contactListSchema, "The contact list created by SurveyMonkey."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List, filter, and search contacts in the connected SurveyMonkey account.",
    requiredScopes: [surveyMonkeyConnectorScopes.contactsRead],
    inputSchema: listContactsInputSchema,
    outputSchema: paginatedOutput(
      "The normalized paginated SurveyMonkey contact list.",
      "The contacts returned on this page.",
      contactSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a SurveyMonkey contact for use in survey invitations.",
    requiredScopes: [surveyMonkeyConnectorScopes.contactsWrite],
    inputSchema: createContactInputSchema,
    outputSchema: s.object("The created SurveyMonkey contact response.", {
      contact: s.describe(contactSchema, "The contact created by SurveyMonkey."),
    }),
  }),
] satisfies ActionDefinition[];

export type SurveyMonkeyActionName = (typeof surveyMonkeyActions)[number]["name"];
