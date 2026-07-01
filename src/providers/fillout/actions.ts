import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fillout";

const noInputSchema = s.object("No input parameters are required for this action.", {});
const questionTypeSchema = s.stringEnum("The Fillout question type.", [
  "ShortAnswer",
  "LongAnswer",
  "EmailInput",
  "MultipleChoice",
  "Checkboxes",
  "Dropdown",
  "FileUpload",
  "DatePicker",
  "NumberInput",
  "PhoneNumber",
  "CurrencyInput",
  "Payment",
  "Signature",
  "Address",
  "Slider",
  "Rating",
  "OpinionScale",
  "Switch",
  "Password",
  "HiddenField",
  "Table",
  "Matrix",
  "Captcha",
  "ImagePicker",
  "ColorPicker",
]);
const questionSchema = s.looseRequiredObject(
  "One question configured on a Fillout form.",
  {
    id: s.string("The stable Fillout question ID."),
    name: s.string("The question label or name."),
    type: questionTypeSchema,
  },
  { optional: ["id", "name", "type"] },
);
const formSchema = s.looseRequiredObject(
  "One Fillout form.",
  {
    formId: s.string("The Fillout form ID."),
    name: s.string("The Fillout form name."),
    questions: s.array("The questions configured on the form.", questionSchema),
    url: s.url("The public Fillout form URL."),
    status: s.string("The Fillout form status."),
    createdAt: s.string("The timestamp when the form was created."),
    updatedAt: s.string("The timestamp when the form was last updated."),
  },
  { optional: ["formId", "name", "questions", "url", "status", "createdAt", "updatedAt"] },
);
const answerSchema = s.looseRequiredObject(
  "One answer returned for a Fillout submission.",
  {
    questionId: s.string("The Fillout question ID."),
    name: s.string("The question label or name."),
    type: questionTypeSchema,
    value: s.unknown("The answer value returned by Fillout for this question type."),
  },
  { optional: ["questionId", "name", "type", "value"] },
);
const submissionSchema = s.looseRequiredObject(
  "One Fillout form submission.",
  {
    submissionId: s.string("The Fillout submission ID."),
    submissionTime: s.string("The timestamp when the submission was received."),
    lastUpdatedAt: s.string("The timestamp when the submission was last updated."),
    questions: s.array("The answers returned for this submission.", answerSchema),
    calculations: s.array("The calculated values returned for this submission.", s.unknown("One calculation entry.")),
    urlParameters: s.unknown("URL parameters captured with the submission."),
    quiz: s.unknown("The quiz result payload when Fillout includes it."),
    documents: s.array("The generated documents attached to the submission.", s.unknown("One document payload.")),
    scheduling: s.unknown("The scheduling payload when Fillout includes it."),
    payments: s.array("The payment payloads attached to the submission.", s.unknown("One payment payload.")),
  },
  {
    optional: [
      "submissionId",
      "submissionTime",
      "lastUpdatedAt",
      "questions",
      "calculations",
      "urlParameters",
      "quiz",
      "documents",
      "scheduling",
      "payments",
    ],
  },
);
const paginationSchema = s.requiredObject("Pagination metadata returned by Fillout.", {
  totalResponses: s.integer("The total number of submissions matching the query.", { minimum: 0 }),
  pageCount: s.integer("The total number of available pages.", { minimum: 0 }),
});
const formIdInputSchema = s.requiredObject("Input payload for a Fillout form endpoint.", {
  formId: s.nonEmptyString("The Fillout form ID."),
});
const submissionIdInputSchema = s.object(
  "Input payload for a Fillout submission endpoint.",
  {
    formId: s.nonEmptyString("The Fillout form ID."),
    submissionId: s.nonEmptyString("The Fillout submission ID."),
    includeEditLink: s.boolean("Whether Fillout should include an edit link in the response."),
  },
  { required: ["formId", "submissionId"], optional: ["includeEditLink"] },
);

export const filloutActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List forms available to the authenticated Fillout account.",
    inputSchema: noInputSchema,
    outputSchema: s.requiredObject("The normalized Fillout form-list response.", {
      forms: s.array("The forms returned by Fillout.", formSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form_metadata",
    description: "Get metadata and configured questions for one Fillout form.",
    inputSchema: formIdInputSchema,
    outputSchema: s.requiredObject("The normalized Fillout form metadata response.", {
      form: formSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_submissions",
    description: "List submissions for one Fillout form with documented pagination and filters.",
    inputSchema: s.object(
      "Input payload for listing Fillout submissions.",
      {
        formId: s.nonEmptyString("The Fillout form ID whose submissions should be listed."),
        limit: s.integer("The maximum number of submissions to return.", { minimum: 1, maximum: 150 }),
        afterDate: s.nonEmptyString("Return submissions received after this ISO timestamp or date."),
        beforeDate: s.nonEmptyString("Return submissions received before this ISO timestamp or date."),
        offset: s.integer("The zero-based offset for paginating submissions.", { minimum: 0 }),
        status: s.stringEnum("The submission status filter.", ["in_progress", "finished"]),
        includeEditLink: s.boolean("Whether Fillout should include edit links in the response."),
        includePreview: s.boolean("Whether Fillout should include preview submissions."),
        sort: s.stringEnum("The sort order for returned submissions.", ["asc", "desc"]),
        search: s.nonEmptyString("The search text passed through to Fillout."),
      },
      {
        required: ["formId"],
        optional: [
          "limit",
          "afterDate",
          "beforeDate",
          "offset",
          "status",
          "includeEditLink",
          "includePreview",
          "sort",
          "search",
        ],
      },
    ),
    outputSchema: s.requiredObject("The normalized Fillout submission-list response.", {
      submissions: s.array("The submissions returned by Fillout.", submissionSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_submission",
    description: "Get one Fillout form submission by submission ID.",
    inputSchema: submissionIdInputSchema,
    outputSchema: s.requiredObject("The normalized Fillout single-submission response.", {
      submission: submissionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_submissions",
    description: "Create one or more submissions for a Fillout form.",
    inputSchema: s.requiredObject("Input payload for creating Fillout submissions.", {
      formId: s.nonEmptyString("The Fillout form ID."),
      submissions: s.array(
        "The submissions to create in Fillout.",
        s.looseObject({}, { description: "One submission object accepted by Fillout." }),
        { minItems: 1, maxItems: 10 },
      ),
    }),
    outputSchema: s.requiredObject("The normalized Fillout create-submissions response.", {
      submissions: s.array("The submissions created by Fillout.", submissionSchema),
      raw: s.record(s.unknown("A raw Fillout response value."), {
        description: "The raw response object returned by Fillout.",
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_submission",
    description: "Delete one Fillout form submission by submission ID.",
    inputSchema: submissionIdInputSchema,
    outputSchema: s.requiredObject("The normalized Fillout delete-submission response.", {
      deleted: s.boolean("Whether the delete request completed successfully."),
      submissionId: s.nullableString("The deleted submission ID when Fillout returns it."),
      raw: s.unknown("The raw response returned by Fillout."),
    }),
  }),
];

export type FilloutActionName =
  | "list_forms"
  | "get_form_metadata"
  | "list_submissions"
  | "get_submission"
  | "create_submissions"
  | "delete_submission";
