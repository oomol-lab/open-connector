import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jotform";

const noInputSchema = s.object("No input parameters are required for this action.", {});
const stringMapSchema = s.record(
  "A string-keyed map returned by Jotform.",
  s.string("The string value returned for this key."),
);
const answerDetailSchema = s.object(
  "One normalized answer entry from a Jotform submission.",
  {
    text: s.string("The question label shown on the Jotform form."),
    type: s.string("The Jotform question type, such as control_textbox."),
    answer: s.unknown("The raw answer payload returned by Jotform."),
    prettyFormat: s.string("The formatted answer string returned by Jotform when available."),
  },
  { optional: ["text", "type", "answer", "prettyFormat"], additionalProperties: true },
);
const submissionSchema = s.object(
  "One normalized Jotform submission.",
  {
    id: s.nonEmptyString("The unique Jotform submission ID."),
    form_id: s.nonEmptyString("The Jotform form ID that owns this submission."),
    ip: s.string("The submitter IP address reported by Jotform."),
    created_at: s.string("The timestamp when the submission was created."),
    updated_at: s.string("The timestamp when the submission was last updated."),
    status: s.string("The Jotform submission status."),
    new: s.boolean("Whether the submission is currently marked as new."),
    answers: s.record("The answers keyed by Jotform question ID.", answerDetailSchema),
    workflowStatus: s.string("The workflow status reported by Jotform when a workflow is attached."),
  },
  { optional: ["ip", "created_at", "updated_at", "status", "workflowStatus"], additionalProperties: true },
);
const questionSchema = s.object(
  "One normalized Jotform question definition.",
  {
    qid: s.nonEmptyString("The unique Jotform question ID."),
    type: s.string("The Jotform question type, such as control_textbox."),
    text: s.string("The visible question label on the form."),
    name: s.string("The Jotform internal question name."),
    order: s.string("The position of the question in the form."),
    required: s.string("Whether Jotform marks the question as required."),
    readonly: s.string("Whether Jotform marks the question as readonly."),
    labelAlign: s.string("The configured label alignment for the question."),
    hint: s.string("The question hint text returned by Jotform."),
    validation: s.string("The validation mode configured on the question."),
    sublabels: stringMapSchema,
  },
  {
    optional: ["text", "name", "order", "required", "readonly", "labelAlign", "hint", "validation", "sublabels"],
    additionalProperties: true,
  },
);
const formSchema = s.object(
  "One normalized Jotform form summary.",
  {
    id: s.nonEmptyString("The unique Jotform form ID."),
    username: s.string("The Jotform username that owns the form."),
    title: s.string("The visible form title."),
    height: s.integer("The configured form height in pixels."),
    status: s.string("The current Jotform form status."),
    created_at: s.string("The timestamp when the form was created."),
    updated_at: s.string("The timestamp when the form was last updated."),
    last_submission: s.string("The timestamp of the most recent form submission."),
    new: s.nonNegativeInteger("The count of unread submissions."),
    count: s.nonNegativeInteger("The total submission count."),
    type: s.string("The Jotform form type, such as LEGACY or CARD."),
    favorite: s.boolean("Whether the form is marked as a favorite."),
    archived: s.boolean("Whether the form is archived."),
    url: s.string("The public URL of the Jotform form."),
  },
  {
    optional: [
      "username",
      "title",
      "height",
      "status",
      "created_at",
      "updated_at",
      "last_submission",
      "new",
      "count",
      "type",
      "favorite",
      "archived",
      "url",
    ],
    additionalProperties: true,
  },
);
const resultSetSchema = s.object("The Jotform pagination metadata returned for form listings.", {
  offset: s.nonNegativeInteger("The starting offset of the returned form page."),
  limit: s.positiveInteger("The maximum number of forms requested."),
  count: s.nonNegativeInteger("The number of forms returned in this page."),
});
const userSchema = s.object(
  "The normalized current Jotform account.",
  {
    username: s.nonEmptyString("The Jotform username associated with the API key."),
    name: s.string("The full name reported by Jotform."),
    email: s.string("The account email address reported by Jotform."),
    website: s.string("The website URL stored on the Jotform account."),
    time_zone: s.string("The configured IANA time zone for the account."),
    account_type: s.string("The Jotform account plan URL or identifier."),
    status: s.string("The current account status reported by Jotform."),
    created_at: s.string("The timestamp when the account was created."),
    updated_at: s.string("The timestamp when the account was last updated."),
    is_verified: s.boolean("Whether the Jotform account is verified."),
    usage: s.string("The Jotform usage endpoint URL for the account."),
    industry: s.string("The industry configured on the account."),
    company: s.string("The company configured on the account."),
    language: s.string("The language configured on the account."),
    avatarUrl: s.string("The avatar URL reported by Jotform."),
    webhooks: s.array(
      "The account-level webhooks configured in Jotform.",
      s.string("One webhook URL configured on the account."),
    ),
    doNotClone: s.boolean("Whether the account disables form cloning."),
  },
  {
    optional: [
      "name",
      "email",
      "website",
      "time_zone",
      "account_type",
      "status",
      "created_at",
      "updated_at",
      "usage",
      "industry",
      "company",
      "language",
      "avatarUrl",
    ],
  },
);
const listFormsInputSchema = s.object(
  "Input payload for listing Jotform forms.",
  {
    limit: s.positiveInteger("The maximum number of forms to return.", { maximum: 1000 }),
    offset: s.nonNegativeInteger("The starting offset for the forms page."),
    search: s.nonEmptyString("The free-text search query for matching forms."),
    folder: s.nonEmptyString("The folder ID used to filter returned forms."),
    orderby: s.nonEmptyString("The Jotform form field used for upstream sorting."),
    sorting: s.stringEnum("The upstream sort direction used when listing forms.", ["ASC", "DESC"]),
  },
  { optional: ["limit", "offset", "search", "folder", "orderby", "sorting"] },
);
const getFormInputSchema = s.object("Input payload for retrieving one Jotform form.", {
  formId: s.nonEmptyString("The Jotform form ID to retrieve."),
});
const listFormQuestionsInputSchema = s.object("Input payload for listing the questions on one Jotform form.", {
  formId: s.nonEmptyString("The Jotform form ID whose questions should be listed."),
});
const listFormSubmissionsInputSchema = s.object(
  "Input payload for listing Jotform submissions on one form.",
  {
    formId: s.nonEmptyString("The Jotform form ID whose submissions should be listed."),
    limit: s.positiveInteger("The maximum number of submissions to return.", { maximum: 1000 }),
    offset: s.nonNegativeInteger("The starting offset for the submissions page."),
  },
  { optional: ["limit", "offset"] },
);
const getSubmissionInputSchema = s.object("Input payload for retrieving one Jotform submission.", {
  submissionId: s.nonEmptyString("The Jotform submission ID to retrieve."),
});
const answersInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: true,
  minProperties: 1,
  description:
    "The submission answers keyed by Jotform question ID. Values may be scalars, arrays, or nested objects for compound fields.",
};
const createSubmissionInputSchema = s.object(
  "Input payload for creating a submission on a Jotform form.",
  {
    formId: s.nonEmptyString("The Jotform form ID that will receive the submission."),
    answers: answersInputSchema,
    markAsNew: s.boolean("Whether Jotform should mark the submission as new."),
    flag: s.boolean("Whether Jotform should set the submission flag."),
  },
  { optional: ["markAsNew", "flag"] },
);

export const jotformActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Jotform account associated with the authenticated API key.",
    requiredScopes: [],
    inputSchema: noInputSchema,
    outputSchema: s.object("The normalized current-user response returned by Jotform.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_forms",
    description: "List forms available to the authenticated Jotform account.",
    requiredScopes: [],
    inputSchema: listFormsInputSchema,
    outputSchema: s.object(
      "The normalized form-list response returned by Jotform.",
      {
        forms: s.array("The forms returned by Jotform.", formSchema),
        resultSet: resultSetSchema,
      },
      { optional: ["resultSet"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Get one Jotform form by form ID.",
    requiredScopes: [],
    inputSchema: getFormInputSchema,
    outputSchema: s.object("The normalized single-form response returned by Jotform.", {
      form: formSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_form_questions",
    description: "List the question definitions configured on one Jotform form.",
    requiredScopes: [],
    inputSchema: listFormQuestionsInputSchema,
    outputSchema: s.object("The normalized question-list response returned by Jotform.", {
      questions: s.record("The normalized questions keyed by Jotform question ID.", questionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_form_submissions",
    description: "List submissions for one Jotform form.",
    requiredScopes: [],
    inputSchema: listFormSubmissionsInputSchema,
    outputSchema: s.object("The normalized submission-list response returned by Jotform.", {
      submissions: s.array("The submissions returned by Jotform.", submissionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_submission",
    description: "Get one Jotform submission by submission ID.",
    requiredScopes: [],
    inputSchema: getSubmissionInputSchema,
    outputSchema: s.object("The normalized single-submission response returned by Jotform.", {
      submission: submissionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_submission",
    description: "Create a submission on a Jotform form using question IDs and answer values.",
    requiredScopes: [],
    inputSchema: createSubmissionInputSchema,
    outputSchema: s.object("The normalized submission-create response returned by Jotform.", {
      submissionId: s.nonEmptyString("The Jotform submission ID created by the request."),
      submissionUrl: s.string("The API URL that can be used to retrieve the created Jotform submission."),
    }),
  }),
];
