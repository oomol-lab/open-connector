import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tally";

const pageSchema = s.number("Page number for pagination. Tally defaults to 1.");
const limitSchema = s.number("Number of items per page. Tally documents a maximum of 500.", {
  minimum: 1,
  maximum: 500,
});
const paymentSchema = s.looseObject("Payment summary attached to a Tally form.", {
  amount: s.number("Payment amount configured on the form."),
  currency: s.string("Payment currency configured on the form."),
});
const formSummaryProperties = {
  id: s.string("Tally form ID."),
  name: s.string("Tally form name."),
  workspaceId: s.string("Workspace ID that owns the form."),
  status: s.stringEnum("Tally form status.", ["BLANK", "DRAFT", "PUBLISHED", "DELETED"]),
  numberOfSubmissions: s.number("Number of submissions collected by the form."),
  isClosed: s.boolean("Whether the form is closed."),
  payments: s.array("Payment settings returned for the form.", paymentSchema),
  createdAt: s.dateTime("Timestamp when the form was created."),
  updatedAt: s.dateTime("Timestamp when the form was last updated."),
};
const formSummarySchema = s.looseObject("Tally form summary.", formSummaryProperties);
const questionSchema = s.looseObject("Question metadata returned with submissions.");
const submissionSchema = s.looseObject("Tally form submission.", {
  id: s.string("Submission ID."),
  formId: s.string("Form ID."),
  responses: s.array("Responses captured in the submission.", s.looseObject("One answer response.")),
});

export const tallyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    operationType: "read",
    description: "List Tally forms with optional pagination and workspace filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        page: pageSchema,
        limit: limitSchema,
        workspaceIds: s.stringArray("Workspace IDs used to filter the returned forms."),
      },
      [],
      "Optional query parameters for listing Tally forms.",
    ),
    outputSchema: s.looseRequiredObject("Paginated Tally forms response.", {
      items: s.array("Forms returned by Tally.", formSummarySchema),
      page: s.number("Current page number."),
      limit: s.number("Number of items per page."),
      total: s.number("Total number of forms matching the query."),
      hasMore: s.boolean("Whether more pages are available."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form",
    operationType: "read",
    description: "Fetch a single Tally form by ID with its blocks and settings.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { formId: s.nonEmptyString("Tally form ID to retrieve.") },
      ["formId"],
      "Path parameters for fetching a Tally form.",
    ),
    outputSchema: s.looseObject("Full Tally form response.", {
      ...formSummaryProperties,
      settings: s.looseObject("Tally form settings."),
      blocks: s.array("Blocks and settings returned for the form.", s.looseObject("Raw form block payload.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_submissions",
    operationType: "read",
    description: "List submissions for a Tally form with pagination and documented completion/date filters.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        formId: s.nonEmptyString("Tally form ID whose submissions should be listed."),
        page: pageSchema,
        limit: limitSchema,
        filter: s.stringEnum("Submission completion status filter.", ["all", "completed", "partial"]),
        startDate: s.dateTime("Filter submissions submitted on or after this ISO 8601 timestamp."),
        endDate: s.dateTime("Filter submissions submitted on or before this ISO 8601 timestamp."),
        afterId: s.nonEmptyString("Submission ID after which results should be returned."),
      },
      ["formId"],
      "Path and query parameters for listing Tally form submissions.",
    ),
    outputSchema: s.looseRequiredObject("Paginated Tally submissions response.", {
      page: s.number("Current page number."),
      limit: s.number("Number of submissions per page."),
      hasMore: s.boolean("Whether more pages are available."),
      totalNumberOfSubmissionsPerFilter: s.looseObject("Submission totals per completion filter."),
      questions: s.array("Questions returned for the form.", questionSchema),
      submissions: s.array("Submissions returned by Tally.", submissionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_submission",
    operationType: "read",
    description: "Fetch a single Tally form submission by ID with its responses and questions.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        formId: s.nonEmptyString("Tally form ID that owns the submission."),
        submissionId: s.nonEmptyString("Tally submission ID to retrieve."),
      },
      ["formId", "submissionId"],
      "Path parameters for fetching a Tally form submission.",
    ),
    outputSchema: s.looseRequiredObject("Tally submission detail response.", {
      questions: s.array("Questions returned for the form.", questionSchema),
      submission: submissionSchema,
    }),
  }),
];
