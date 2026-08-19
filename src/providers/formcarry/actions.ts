import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "formcarry";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const integer = (description: string) => s.integer(description);
const nullableInteger = (description: string) => s.nullable(integer(description));
const string = (description: string) => s.string(description);

const createFormInputSchema = s.object(
  "Basic Formcarry form settings supported by the first provider pass.",
  {
    name: nonEmptyString("Name of the form."),
    email: nonEmptyString("Comma-separated email addresses that should receive submission notifications."),
    returnUrl: s.url(
      "URL to redirect users to after a successful submission when not using the built-in thank-you page.",
    ),
    failUrl: s.url("URL to redirect users to after a failed submission when returnUrl is configured."),
    returnParams: s.boolean("Whether Formcarry should append submission data to the returnUrl query string."),
    googleRecaptcha: s.string("Google reCAPTCHA secret key used to enable spam protection for the form."),
    webhook: s.url("Webhook URL that Formcarry should call with a POST request for each submission."),
    retention: s.boolean("Whether Formcarry should save incoming submissions to its database."),
  },
  {
    optional: ["returnUrl", "failUrl", "returnParams", "googleRecaptcha", "webhook", "retention"],
  },
);

const deleteFormInputSchema = s.requiredObject("Path parameters for deleting a Formcarry form.", {
  form_id: nonEmptyString("Formcarry form ID to delete."),
});

const listSubmissionsInputSchema = s.object(
  "Path and query parameters accepted by the Formcarry submissions endpoint.",
  {
    form_id: nonEmptyString("Formcarry form ID whose submissions should be retrieved."),
    limit: s.integer("Maximum number of submissions to return. Formcarry documents a maximum of 50.", {
      minimum: 1,
      maximum: 50,
    }),
    page: s.positiveInteger("Page number to retrieve."),
    sort: s.string("Sorting criteria in the format field:order, such as createdAt:-1 or createdAt:1."),
    filter: s.string(
      "Comma-separated filter expressions in the format key:value, including documented filters like date:7, attachments:true, or spam:false.",
    ),
  },
  { optional: ["limit", "page", "sort", "filter"] },
);

const formcarryResultSchema = s.looseRequiredObject(
  "Base success payload returned by Formcarry form mutation endpoints.",
  {
    code: integer("Numeric status code returned by Formcarry."),
    title: string("Title message returned by Formcarry."),
    message: string("Human-readable message returned by Formcarry."),
    type: string("Result type returned by Formcarry."),
  },
);

const createFormOutputSchema = s.looseRequiredObject("Successful response returned after creating a Formcarry form.", {
  code: integer("Numeric status code returned by Formcarry."),
  title: string("Title message returned by Formcarry."),
  message: string("Human-readable message returned by Formcarry."),
  type: string("Result type returned by Formcarry."),
  formUrl: string("Hosted Formcarry form URL created for the new form."),
});

const submissionFieldSchema = s.looseObject("Submission field entry returned by Formcarry.", {
  key: string("Field key returned by Formcarry."),
  label: string("Field label returned by Formcarry."),
  type: string("Field type returned by Formcarry."),
  value: s.unknown("Field value returned by Formcarry."),
});

const submissionSchema = s.looseObject("Submission object returned by Formcarry.", {
  _id: string("Unique identifier of the submission."),
  form: string("Form ID associated with the submission."),
  createdAt: string("Timestamp when the submission was created."),
  updatedAt: string("Timestamp when the submission was last updated."),
  fields: s.array("Field values captured in the submission.", submissionFieldSchema),
});

const paginationSchema = s.looseRequiredObject("Pagination metadata returned by Formcarry.", {
  current_page: integer("Current page number."),
  previous_page: nullableInteger("Previous page number, or null when unavailable."),
  next_page: nullableInteger("Next page number, or null when unavailable."),
  total_page: integer("Total number of available pages."),
  total_submissions: integer("Total number of submissions available for the form."),
});

const listSubmissionsOutputSchema = s.looseRequiredObject("Submission list response returned by Formcarry.", {
  form: string("Form ID whose submissions were requested."),
  results: integer("Number of submissions returned in the current response."),
  submissions: s.array("Submissions returned by Formcarry.", submissionSchema),
  pagination: paginationSchema,
});

export const formcarryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_form",
    description: "Create a new Formcarry form with basic notification, redirect, and storage settings.",
    requiredScopes: [],
    inputSchema: createFormInputSchema,
    outputSchema: createFormOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_form",
    description: "Delete an existing Formcarry form by ID.",
    requiredScopes: [],
    inputSchema: deleteFormInputSchema,
    outputSchema: formcarryResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_submissions",
    description:
      "List submissions for a Formcarry form with the documented pagination, sorting, and filtering query parameters.",
    requiredScopes: [],
    inputSchema: listSubmissionsInputSchema,
    outputSchema: listSubmissionsOutputSchema,
  }),
];
