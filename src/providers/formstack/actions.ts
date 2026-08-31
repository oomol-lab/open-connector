import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "formstack" as const;

const formIdSchema = s.positiveInteger("The Formstack form ID.");
const submissionIdSchema = s.positiveInteger("The Formstack submission ID.");

const paginationSchema = s.looseObject("Pagination details returned by Formstack.", {
  size: s.nonNegativeInteger("Number of records returned on the current page."),
  pageNumber: s.positiveInteger("Current page number."),
  pageSize: s.positiveInteger("Configured page size."),
  totalElements: s.nonNegativeInteger("Total number of matching records."),
  totalPages: s.nonNegativeInteger("Total number of result pages."),
});

const formSchema = s.looseObject("A Formstack form.", {
  id: s.positiveInteger("The form ID."),
  name: s.nullableString("The form name."),
  viewKey: s.string("The public form view key."),
  url: s.string("The live form URL returned by Formstack."),
  active: s.boolean("Whether the form is active."),
  submissionsCount: s.nonNegativeInteger("Total number of form submissions."),
  unreadSubmissionsCount: s.nonNegativeInteger("Number of unread form submissions."),
  created: s.string("The provider-formatted form creation time."),
  updated: s.string("The provider-formatted form update time."),
  fields: s.nullable(s.array("Fields included with detailed form data.", s.looseObject("A Formstack field."))),
});

const fieldSchema = s.looseObject("A Formstack form field.", {
  id: s.positiveInteger("The field ID."),
  label: s.nullableString("The field label."),
  type: s.string("The field type."),
  required: s.nullableBoolean("Whether the field is required, or null when unspecified."),
});

const submissionSchema = s.looseObject("A Formstack submission.", {
  id: s.nullableInteger("The submission ID."),
  formId: s.nullableInteger("The form ID that owns the submission."),
  timestamp: s.nullableString("The provider-formatted submission timestamp."),
  prettyName: s.nullableString("The human-readable submission name when requested."),
  data: s.nullable(s.unknown("Field data returned for the submission.")),
});

const submissionFieldInputSchema = s.object("One field value in a Formstack submission.", {
  id: s.nonEmptyString("The form field ID."),
  value: s.unknown("The field value in the shape supported by the field type."),
});

const searchCriterionSchema = s.object("One field-level submission search criterion.", {
  fieldId: s.nonEmptyString("The field ID to search."),
  value: s.string("The value to match in the field."),
});

const listFormsInputSchema = s.object(
  "Filters and pagination options for listing Formstack forms.",
  {
    pageNumber: s.positiveInteger("Page number, starting at 1."),
    pageSize: s.integer("Number of forms per page.", { minimum: 10, maximum: 500 }),
    search: s.nonEmptyString("Text matched against form names."),
    orderBy: s.nonEmptyString("Form property used to sort results."),
    order: s.stringEnum("Sort direction.", ["ASC", "DESC"]),
    folderId: s.positiveInteger("Folder ID used to filter forms."),
  },
  { optional: ["pageNumber", "pageSize", "search", "orderBy", "order", "folderId"] },
);

const getFormInputSchema = s.object(
  "Parameters for retrieving one Formstack form.",
  {
    formId: formIdSchema,
    includeFields: s.boolean("Whether to include the form fields in the response."),
  },
  { optional: ["includeFields"] },
);

const listSubmissionsInputSchema = s.object(
  "Filters and pagination options for listing submissions from one form.",
  {
    formId: formIdSchema,
    pageNumber: s.positiveInteger("Page number, starting at 1."),
    pageSize: s.integer("Number of submissions per page.", { minimum: 10, maximum: 100 }),
    order: s.stringEnum("Sort direction.", ["ASC", "DESC"]),
    keyword: s.nonEmptyString("Text matched across submission fields."),
    minTime: s.nonEmptyString("Earliest submission time in YYYY-MM-DD or YYYY-MM-DD HH:MM:SS Eastern Time format."),
    maxTime: s.nonEmptyString("Latest submission time in YYYY-MM-DD or YYYY-MM-DD HH:MM:SS Eastern Time format."),
    search: s.array("Field-level search criteria.", searchCriterionSchema, { maxItems: 10 }),
    includeData: s.boolean("Whether to include field data in each submission."),
    expandData: s.boolean("Whether to include parsed field values."),
    prettyName: s.boolean("Whether to include a human-readable submission name."),
    dataFormat: s.stringEnum("Shape used for returned field data.", ["legacy", "standardized"]),
    encryptionPassword: s.nonEmptyString("Form encryption password required to read encrypted submission data."),
  },
  {
    optional: [
      "pageNumber",
      "pageSize",
      "order",
      "keyword",
      "minTime",
      "maxTime",
      "search",
      "includeData",
      "expandData",
      "prettyName",
      "dataFormat",
      "encryptionPassword",
    ],
  },
);

const getSubmissionInputSchema = s.object(
  "Parameters for retrieving one Formstack submission.",
  {
    submissionId: submissionIdSchema,
    encryptionPassword: s.nonEmptyString("Form encryption password required to read encrypted submission data."),
  },
  { optional: ["encryptionPassword"] },
);

const createSubmissionInputSchema = s.object(
  "Data used to create a Formstack submission.",
  {
    formId: formIdSchema,
    fields: s.array("Field values to submit.", submissionFieldInputSchema, { minItems: 1 }),
    userAgent: s.nonEmptyString("Browser user agent associated with the submission."),
    remoteAddress: s.nonEmptyString("IP address associated with the submission."),
    read: s.boolean("Whether the new submission should be marked as read."),
    longitude: s.nonEmptyString("Longitude captured with the submission."),
    latitude: s.nonEmptyString("Latitude captured with the submission."),
    deviceId: s.nonEmptyString("Device identifier associated with the submission."),
  },
  {
    optional: ["userAgent", "remoteAddress", "read", "longitude", "latitude", "deviceId"],
  },
);

const updateSubmissionInputSchema = s.requireAnyProperty(
  s.object(
    "Fields and metadata used to update a Formstack submission.",
    {
      submissionId: submissionIdSchema,
      fields: s.array("Replacement field values.", submissionFieldInputSchema, { minItems: 1 }),
      userAgent: s.nonEmptyString("Updated browser user agent."),
      remoteAddress: s.nonEmptyString("Updated source IP address."),
      paymentStatus: s.nonEmptyString("Updated payment status."),
      read: s.boolean("Whether the submission should be marked as read."),
      timestamp: s.nonEmptyString("Updated provider-formatted submission timestamp."),
      encryptionPassword: s.nonEmptyString("Form encryption password required to update encrypted submission data."),
    },
    {
      optional: ["fields", "userAgent", "remoteAddress", "paymentStatus", "read", "timestamp", "encryptionPassword"],
    },
  ),
  ["fields", "userAgent", "remoteAddress", "paymentStatus", "read", "timestamp"],
);

export const formstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_forms",
    description: "List Formstack forms with pagination, name search, sorting, and folder filtering.",
    requiredScopes: [],
    inputSchema: listFormsInputSchema,
    outputSchema: s.object("A page of Formstack forms.", {
      page: paginationSchema,
      forms: s.array("Forms returned on the current page.", formSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_form",
    description: "Retrieve one Formstack form, optionally including its fields.",
    requiredScopes: [],
    inputSchema: getFormInputSchema,
    outputSchema: s.object("A detailed Formstack form result.", { form: formSchema }),
  }),
  defineProviderAction(service, {
    name: "list_form_fields",
    description: "List the fields defined on a Formstack form.",
    requiredScopes: [],
    inputSchema: s.object("The form whose fields should be listed.", { formId: formIdSchema }),
    outputSchema: s.object("Fields defined on the Formstack form.", {
      fields: s.array("Form fields.", fieldSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_submissions",
    description: "List submissions for a Formstack form with pagination, time, keyword, and field-level filters.",
    requiredScopes: [],
    inputSchema: listSubmissionsInputSchema,
    outputSchema: s.object("A page of Formstack submissions.", {
      page: paginationSchema,
      submissions: s.array("Submissions returned on the current page.", submissionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_submission",
    description: "Retrieve one Formstack submission and its field data.",
    requiredScopes: [],
    inputSchema: getSubmissionInputSchema,
    outputSchema: s.object("A detailed Formstack submission result.", {
      submission: submissionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_submission",
    description: "Create a submission for a Formstack form using field IDs and typed values.",
    requiredScopes: [],
    inputSchema: createSubmissionInputSchema,
    outputSchema: s.object("The created Formstack submission.", {
      submission: submissionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_submission",
    description: "Replace field values or metadata on an existing Formstack submission.",
    requiredScopes: [],
    inputSchema: updateSubmissionInputSchema,
    outputSchema: s.object("The updated Formstack submission.", {
      submission: submissionSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_submission",
    description: "Permanently delete a Formstack submission and its associated data.",
    requiredScopes: [],
    inputSchema: s.object("The submission to delete.", { submissionId: submissionIdSchema }),
    outputSchema: s.object("Formstack submission deletion result.", {
      deleted: s.boolean("Whether the submission was deleted."),
      submissionId: submissionIdSchema,
    }),
  }),
] as const satisfies ActionDefinition[];
