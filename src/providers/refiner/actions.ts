import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "refiner";

const looseObjectSchema = s.looseObject("Object returned by Refiner.");
const unknownRecordSchema = s.record("A record of arbitrary values.", true);
const emptyInputSchema = s.object({}, { description: "The input payload for this action." });
const genericDateTimeField = s.string("Timestamp string returned by Refiner.");
const reportingDateField = s.date("Date in YYYY-MM-DD format.");
const uuidField = s.nonEmptyString("Refiner UUID.");
const remoteIdField = s.nonEmptyString("External user identifier stored in Refiner as id.");
const emailField = s.nonEmptyString("Email address used to identify the Refiner contact.");
const pageField = s.positiveInteger("Page number to request.");
const currentPageField = s.positiveInteger("Current page number to request.");
const pageLengthField = s.positiveInteger("Maximum number of records to return per page.");
const pageCursorField = s.nonEmptyString("Pagination cursor returned by a previous Refiner response.");
const responseStatusField = s.nonEmptyString("Response status filter accepted by Refiner.");
const formTypeField = s.stringEnum("Form state filter accepted by Refiner.", [
  "all",
  "all_with_archived",
  "published",
  "drafts",
  "archived",
]);
const reportTypeField = s.stringEnum("Reporting metric family to request from Refiner.", [
  "nps",
  "csat",
  "score",
  "responses",
  "views",
  "completion",
]);

function optionalStringArray(description: string): JsonSchema {
  return s.stringArray(description, { minItems: 1 });
}

const contactSummarySchema = s.looseObject(
  {
    uuid: s.string("Unique Refiner contact UUID."),
    id: s.string("External user identifier stored on the contact."),
    email: s.string("Email address stored on the contact."),
    name: s.string("Display name stored on the contact."),
  },
  { description: "Refiner contact summary." },
);

const formSummarySchema = s.looseObject(
  {
    uuid: s.string("Unique Refiner form UUID."),
    title: s.string("Form title returned by Refiner."),
    state: s.string("Current form state returned by Refiner."),
  },
  { description: "Refiner form summary." },
);

const segmentSchema = s.looseObject(
  {
    uuid: s.string("Unique Refiner segment UUID."),
    name: s.string("Segment name."),
    is_manual: s.boolean("Whether the segment is managed manually in Refiner."),
    contacts_count: s.integer("Number of contacts currently assigned to the segment."),
  },
  { description: "Refiner segment." },
);

const contactSchema = s.looseObject(
  {
    uuid: s.string("Unique Refiner contact UUID."),
    id: s.string("External user identifier stored on the contact."),
    email: s.string("Email address stored on the contact."),
    name: s.string("Display name stored on the contact."),
    title: s.string("Job title stored on the contact."),
    first_seen_at: genericDateTimeField,
    last_seen_at: genericDateTimeField,
    attributes: s.unknown("Custom attributes returned for the contact."),
    account: looseObjectSchema,
    segments: s.array("Segments assigned to the contact.", segmentSchema),
  },
  { description: "Refiner contact." },
);

const formSchema = s.looseObject(
  {
    uuid: s.string("Unique Refiner form UUID."),
    title: s.string("Form title."),
    state: s.string("Current form state."),
    channels: s.stringArray("Channels configured for the form."),
    created_at: genericDateTimeField,
    published_at: genericDateTimeField,
    archived_at: genericDateTimeField,
    responses_count: s.integer("Number of responses collected by the form."),
    views_count: s.integer("Number of times the form has been viewed."),
    config: looseObjectSchema,
    info: looseObjectSchema,
  },
  { description: "Refiner form." },
);

const responseSchema = s.looseObject(
  {
    uuid: s.string("Unique Refiner response UUID."),
    status: s.string("Current response status."),
    first_shown_at: genericDateTimeField,
    last_shown_at: genericDateTimeField,
    first_data_reception_at: genericDateTimeField,
    last_data_reception_at: genericDateTimeField,
    completed_at: genericDateTimeField,
    contact: contactSummarySchema,
    form: formSummarySchema,
    data: unknownRecordSchema,
    tags: s.stringArray("Tags assigned to the response."),
  },
  { description: "Refiner response." },
);

const paginationSchema = s.looseObject(
  {
    current_page: s.integer("Current page number returned by Refiner."),
    last_page: s.integer("Last available page number."),
    page_length: s.integer("Page length used by Refiner."),
    items_count: s.integer("Total number of items that match the query."),
    next_page_cursor: s.nullableString("Cursor to use for the next page, or null when none exists."),
    previous_page_cursor: s.nullableString("Cursor to use for the previous page, or null when none exists."),
  },
  { description: "Pagination metadata returned by Refiner." },
);

const accountSchema = s.looseObject(
  {
    organization_name: s.string("Organization name associated with the API key."),
    project_name: s.string("Project name associated with the API key."),
    environments: s.stringArray("Enabled environments in the project."),
    subscription: looseObjectSchema,
    monthly_responses_limit: s.integer("Monthly response limit for the current subscription, when present."),
    responses_count: s.integer("Current response count returned by Refiner, when present."),
    usage_percentage: s.number("Current subscription usage percentage, when present."),
  },
  { description: "Refiner account information." },
);

const mutationResultSchema = s.object(
  {
    message: s.string("Confirmation message returned by Refiner."),
    uuid: s.string("Generic UUID returned by Refiner, when present."),
    contactUuid: s.string("Contact UUID referenced by the mutation result, when present."),
    segmentUuid: s.string("Segment UUID referenced by the mutation result, when present."),
    responseUuid: s.string("Response UUID referenced by the mutation result, when present."),
    raw: looseObjectSchema,
  },
  {
    optional: ["uuid", "contactUuid", "segmentUuid", "responseUuid", "raw"],
    description: "Mutation result returned by Refiner.",
  },
);

const getAccountInfoOutputSchema = s.object(
  {
    account: accountSchema,
  },
  { description: "Refiner account information response." },
);
const listContactsOutputSchema = s.object(
  {
    contacts: s.array("Contacts returned by Refiner.", contactSchema),
    pagination: paginationSchema,
  },
  { optional: ["pagination"], description: "Paginated Refiner contact list." },
);
const getContactOutputSchema = s.object(
  {
    contact: contactSchema,
  },
  { description: "Single Refiner contact response." },
);
const listFormsOutputSchema = s.object(
  {
    forms: s.array("Forms returned by Refiner.", formSchema),
    pagination: paginationSchema,
  },
  { optional: ["pagination"], description: "Paginated Refiner form list." },
);
const listSegmentsOutputSchema = s.object(
  {
    segments: s.array("Segments returned by Refiner.", segmentSchema),
    pagination: paginationSchema,
  },
  { optional: ["pagination"], description: "Paginated Refiner segment list." },
);
const listResponsesOutputSchema = s.object(
  {
    responses: s.array("Responses returned by Refiner.", responseSchema),
    pagination: paginationSchema,
  },
  { optional: ["pagination"], description: "Paginated Refiner response list." },
);
const getReportingOutputSchema = s.object(
  {
    reportType: reportTypeField,
    report: looseObjectSchema,
  },
  { description: "Refiner reporting response." },
);

const getContactInputSchema = s.object(
  {
    id: remoteIdField,
    email: emailField,
    uuid: uuidField,
  },
  {
    optional: ["id", "email", "uuid"],
    description:
      "Input parameters for retrieving a single Refiner contact. Exactly one of id, email, or uuid is required.",
  },
);
const identifyUserInputSchema = s.object(
  {
    id: remoteIdField,
    email: emailField,
    uuid: uuidField,
    name: s.nonEmptyString("Display name of the contact."),
    traits: unknownRecordSchema,
    account: looseObjectSchema,
    segmentUuids: optionalStringArray("Segment UUIDs to assign to the contact during identification."),
  },
  {
    optional: ["id", "email", "uuid", "name", "traits", "account", "segmentUuids"],
    description:
      "Input parameters for identifying or updating a Refiner contact. At least one of id, email, or uuid is required.",
  },
);
const trackEventInputSchema = s.object(
  {
    id: remoteIdField,
    email: emailField,
    uuid: uuidField,
    eventName: s.nonEmptyString("Event name to track in Refiner."),
    sessionId: s.nonEmptyString("Session identifier associated with the event."),
    receivedAt: genericDateTimeField,
    eventAttributes: unknownRecordSchema,
  },
  {
    optional: ["id", "email", "uuid", "sessionId", "receivedAt", "eventAttributes"],
    description: "Input parameters for tracking a Refiner event. At least one of id, email, or uuid is required.",
  },
);
const listContactsInputSchema = s.object(
  {
    page: pageField,
    pageCursor: pageCursorField,
    pageLength: pageLengthField,
  },
  { optional: ["page", "pageCursor", "pageLength"], description: "Input parameters for listing Refiner contacts." },
);
const listFormsInputSchema = s.object(
  {
    uuid: s.nonEmptyString("Optional form UUID filter."),
    type: formTypeField,
    currentPage: currentPageField,
    pageLength: pageLengthField,
    showConfig: s.boolean("Whether to include the full form config in the response."),
    showInfo: s.boolean("Whether to include form info metadata."),
  },
  {
    optional: ["uuid", "type", "currentPage", "pageLength", "showConfig", "showInfo"],
    description: "Input parameters for listing Refiner forms.",
  },
);
const listSegmentsInputSchema = s.object(
  {
    uuid: s.nonEmptyString("Optional segment UUID filter."),
    currentPage: currentPageField,
    pageLength: pageLengthField,
  },
  { optional: ["uuid", "currentPage", "pageLength"], description: "Input parameters for listing Refiner segments." },
);
const listResponsesInputSchema = s.object(
  {
    currentPage: currentPageField,
    pageCursor: pageCursorField,
    pageLength: pageLengthField,
    status: responseStatusField,
    formUuid: s.nonEmptyString("Filter responses by form UUID."),
    contactUuid: s.nonEmptyString("Filter responses by contact UUID."),
    segmentUuid: s.nonEmptyString("Filter responses by segment UUID."),
    dateRangeStart: reportingDateField,
    dateRangeEnd: reportingDateField,
  },
  {
    optional: [
      "currentPage",
      "pageCursor",
      "pageLength",
      "status",
      "formUuid",
      "contactUuid",
      "segmentUuid",
      "dateRangeStart",
      "dateRangeEnd",
    ],
    description: "Input parameters for listing Refiner responses.",
  },
);
const tagResponseInputSchema = s.object(
  {
    responseUuid: s.nonEmptyString("Response UUID to tag."),
    tagName: s.nonEmptyString("Tag name to apply to the response."),
  },
  { description: "Input parameters for tagging a Refiner response." },
);
const getReportingInputSchema = s.object(
  {
    reportType: reportTypeField,
    questionIdentifiers: optionalStringArray("Question identifiers used to scope the reporting result."),
    formUuids: optionalStringArray("Form UUIDs used to scope the reporting result."),
    segmentUuids: optionalStringArray("Segment UUIDs used to scope the reporting result."),
    tagUuids: optionalStringArray("Tag UUIDs used to scope the reporting result."),
    dateRangeStart: reportingDateField,
    dateRangeEnd: reportingDateField,
  },
  {
    optional: ["questionIdentifiers", "formUuids", "segmentUuids", "tagUuids", "dateRangeStart", "dateRangeEnd"],
    description: "Input parameters for retrieving a Refiner report.",
  },
);
const syncSegmentInputSchema = s.object(
  {
    segmentUuid: s.nonEmptyString("Segment UUID used for the sync operation."),
    id: remoteIdField,
    email: emailField,
    uuid: uuidField,
  },
  {
    optional: ["id", "email", "uuid"],
    description:
      "Input parameters for syncing a Refiner contact with a segment. At least one of id, email, or uuid is required.",
  },
);

export const refinerActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    operationType: "read",
    description: "Retrieve the current Refiner account, project, and subscription information.",
    inputSchema: emptyInputSchema,
    outputSchema: getAccountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List contacts available in the connected Refiner workspace.",
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Retrieve a single Refiner contact by id, email, or uuid.",
    inputSchema: getContactInputSchema,
    outputSchema: getContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "identify_user",
    operationType: "write",
    description: "Create or update a Refiner contact using the official identify-user endpoint.",
    inputSchema: identifyUserInputSchema,
    outputSchema: mutationResultSchema,
  }),
  defineProviderAction(service, {
    name: "track_event",
    operationType: "write",
    description: "Track a product event for a Refiner contact.",
    inputSchema: trackEventInputSchema,
    outputSchema: mutationResultSchema,
  }),
  defineProviderAction(service, {
    name: "list_forms",
    operationType: "read",
    description: "List forms in the connected Refiner workspace.",
    inputSchema: listFormsInputSchema,
    outputSchema: listFormsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_segments",
    operationType: "read",
    description: "List segments in the connected Refiner workspace.",
    inputSchema: listSegmentsInputSchema,
    outputSchema: listSegmentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_responses",
    operationType: "read",
    description: "List survey responses collected in Refiner.",
    inputSchema: listResponsesInputSchema,
    outputSchema: listResponsesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "tag_response",
    operationType: "write",
    description: "Apply a tag to a Refiner response.",
    inputSchema: tagResponseInputSchema,
    outputSchema: mutationResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_reporting",
    operationType: "read",
    description: "Retrieve Refiner reporting metrics for forms, segments, and questions.",
    inputSchema: getReportingInputSchema,
    outputSchema: getReportingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_contact_to_segment",
    operationType: "write",
    description: "Add a Refiner contact to a manual segment.",
    inputSchema: syncSegmentInputSchema,
    outputSchema: mutationResultSchema,
  }),
  defineProviderAction(service, {
    name: "remove_contact_from_segment",
    operationType: "destructive",
    description: "Remove a Refiner contact from a manual segment.",
    inputSchema: syncSegmentInputSchema,
    outputSchema: mutationResultSchema,
  }),
];
