import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "boloforms";

const paginationPageSchema = s.positiveInteger("The page number returned in the current response.");
const paginationLimitSchema = s.positiveInteger("The page size used in the current response.");
const paginationTotalSchema = s.nonNegativeInteger("The total number of records that match the current query.");

const documentSchema = s.object(
  "A single document record in the BoloForms workspace.",
  {
    documentId: s.nonEmptyString(
      "The unique document identifier, which can be reused to start signing or track status.",
    ),
    documentName: s.nonEmptyString("The document name."),
    signingType: s.nonEmptyString("The signing type, such as PDF_TEMPLATE or FORM_TEMPLATE."),
    status: s.nonEmptyString("The current document status."),
    createdAt: s.nonEmptyString("The document creation time, usually as an ISO 8601 timestamp."),
    updatedAt: s.nonEmptyString("The most recent document update time, usually as an ISO 8601 timestamp."),
  },
  { required: ["documentId", "documentName", "signingType", "status", "createdAt", "updatedAt"] },
);

const signerSchema = s.object(
  "A single participant in a template signing request or signing result.",
  {
    signerId: s.nonEmptyString("The unique signer identifier."),
    respondentDocumentId: s.nonEmptyString("The respondent document identifier associated with this signer."),
    name: s.nonEmptyString("The signer name."),
    email: s.email("The signer email address."),
    status: s.nonEmptyString("The current signer status."),
    roleTitle: s.nonEmptyString("The signer role title."),
    roleColor: s.nonEmptyString("The signer role color."),
    hasDeclined: s.boolean("Whether the signer has declined the request."),
    signingOrderNo: s.integer("The signer order number."),
    raw: s.record("The raw signer fields returned by the upstream API.", true),
  },
  {
    optional: [
      "signerId",
      "respondentDocumentId",
      "name",
      "email",
      "status",
      "roleTitle",
      "roleColor",
      "hasDeclined",
      "signingOrderNo",
      "raw",
    ],
  },
);

const formResponseSchema = s.object(
  "A single form response.",
  {
    responseId: s.nonEmptyString("The unique form response identifier."),
    name: s.nonEmptyString("The respondent name."),
    email: s.email("The respondent email address."),
    submittedAt: s.nonEmptyString("The form response submission time."),
    answers: s.record("The form answer object. Field names and structure depend on the specific form.", true),
    raw: s.record("The raw response fields returned by the upstream API.", true),
  },
  {
    optional: ["responseId", "name", "email", "submittedAt", "answers", "raw"],
  },
);

const listDocumentsInputSchema = s.object(
  "The filter and pagination parameters available when listing BoloForms documents.",
  {
    workspaceId: s.nonEmptyString(
      "The workspace ID to query. When provided, it is sent through the workspaceid header.",
    ),
    query: s.nonEmptyString("Filter the document list by document name or keywords."),
    documentId: s.nonEmptyString("Filter results by a specific document ID."),
    filter: s.nonEmptyString("A filter value supported by the official API."),
    sortBy: s.nonEmptyString("The field used for sorting."),
    sortOrder: s.nonEmptyString("The sort direction, such as asc or desc."),
    dateFrom: s.nonEmptyString("The lower bound of the document start time filter."),
    dateTo: s.nonEmptyString("The upper bound of the document end time filter."),
    page: s.positiveInteger("The page number, starting from 1."),
    limit: s.positiveInteger("The number of items to return per page."),
  },
  {
    optional: [
      "workspaceId",
      "query",
      "documentId",
      "filter",
      "sortBy",
      "sortOrder",
      "dateFrom",
      "dateTo",
      "page",
      "limit",
    ],
  },
);

const listDocumentsOutputSchema = s.object(
  "The result of the document list query.",
  {
    message: s.string("The informational message returned by the upstream API."),
    documentsCount: s.nonNegativeInteger("The total number of documents in the current workspace."),
    formCount: s.nonNegativeInteger("The total number of forms in the current workspace."),
    page: paginationPageSchema,
    limit: paginationLimitSchema,
    documents: s.array("The list of documents returned by this query.", documentSchema),
  },
  { required: ["documents"], optional: ["message", "documentsCount", "formCount", "page", "limit"] },
);

const sendSignerInputSchema = s.object(
  "A single signer used when starting a template signing request.",
  {
    name: s.nonEmptyString("The signer name."),
    email: s.email("The signer email address."),
    subject: s.nonEmptyString("The email subject sent to this signer."),
    message: s.nonEmptyString("The email body sent to this signer."),
    roleTitle: s.nonEmptyString("The signer role title."),
    roleColor: s.nonEmptyString("The signer role color."),
  },
  {
    required: ["name", "email"],
  },
);

const sendTemplateInputSchema = s.object(
  "The input payload for starting a signing request from an existing template.",
  {
    documentId: s.nonEmptyString("The template or document ID to use for the signing request."),
    signingType: s.stringEnum("The signing type, which must match the template type configured in BoloForms.", [
      "PDF_TEMPLATE",
      "FORM_TEMPLATE",
    ]),
    mailSubject: s.nonEmptyString("The default email subject."),
    mailMessage: s.nonEmptyString("The default email body."),
    signers: s.array("The list of participants who will receive the signing request.", sendSignerInputSchema, {
      minItems: 1,
    }),
    customVariables: s.record("The values for custom template variables, which are mapped to variablesData.", true),
    pdfData: s.record("Extra PDF parameters used only for the PDF_TEMPLATE scenario.", true),
  },
  {
    required: ["documentId", "signingType", "signers"],
  },
);

const sendTemplateOutputSchema = s.object(
  "The normalized result returned after starting a template signing request.",
  {
    success: s.boolean("Whether the connector successfully sent the request to the upstream API."),
    message: s.string("The result message returned by the upstream API."),
    documentId: s.string("The document ID associated with this signing result."),
    documentName: s.string("The document name associated with this signing result."),
    signingType: s.string("The signing type returned by the upstream API."),
    signers: s.array("The signer summary returned by the upstream API.", signerSchema),
    raw: s.record("The preserved raw result object returned by the upstream API.", true),
  },
  { required: ["success"], optional: ["message", "documentId", "documentName", "signingType", "signers", "raw"] },
);

const listTemplateRespondentsInputSchema = s.object(
  "The input parameters for listing template respondents.",
  {
    templateId: s.nonEmptyString("The template ID."),
    page: s.positiveInteger("The page number, starting from 1."),
    limit: s.positiveInteger("The number of items to return per page."),
  },
  { required: ["templateId"] },
);

const listTemplateRespondentsOutputSchema = s.object(
  "The result of the template respondent query.",
  {
    templateId: s.string("The template ID associated with this query."),
    page: paginationPageSchema,
    limit: paginationLimitSchema,
    total: paginationTotalSchema,
    respondents: s.array("The current list of signing participants for the template.", signerSchema),
  },
  { required: ["respondents"], optional: ["templateId", "page", "limit", "total"] },
);

const getFormResponsesInputSchema = s.object(
  "The input parameters for listing form responses.",
  {
    formId: s.nonEmptyString("The form ID."),
    page: s.positiveInteger("The page number, starting from 1."),
    limit: s.positiveInteger("The number of items to return per page."),
  },
  { required: ["formId"] },
);

const getFormResponsesOutputSchema = s.object(
  "The result of the form response query.",
  {
    formId: s.string("The form ID associated with this query."),
    page: paginationPageSchema,
    limit: paginationLimitSchema,
    total: paginationTotalSchema,
    responses: s.array("The list of form responses.", formResponseSchema),
  },
  { required: ["responses"], optional: ["formId", "page", "limit", "total"] },
);

export const boloformsActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description: "List documents and form statistics from the current BoloForms workspace.",
    inputSchema: listDocumentsInputSchema,
    outputSchema: listDocumentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "send_template_for_signing",
    operationType: "write",
    description: "Start a signing request for a group of participants by using an existing template.",
    inputSchema: sendTemplateInputSchema,
    outputSchema: sendTemplateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_template_respondents",
    operationType: "read",
    description: "List the current signing participants and their statuses for a specific template.",
    inputSchema: listTemplateRespondentsInputSchema,
    outputSchema: listTemplateRespondentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_form_responses",
    operationType: "read",
    description: "List response records for a specific form so they can be used in follow-up automations.",
    inputSchema: getFormResponsesInputSchema,
    outputSchema: getFormResponsesOutputSchema,
  }),
];
