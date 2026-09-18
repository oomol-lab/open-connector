import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { extendObject } from "./schemas.ts";
import { nullableString } from "./schemas.ts";
import {
  additionalFiltersInputField,
  customFieldInstanceInputSchema,
  deletedOutputSchema,
  documentSchema,
  documentVersionSchema,
  emptyInputSchema,
  fileNameInputField,
  transitFileInputField,
  fullPermsInputField,
  idArrayField,
  idField,
  noteSchema,
  ownerInputField,
  pageInputFields,
  paginatedOutputSchema,
  resultOutputSchema,
  setPermissionsInputSchema,
  shareLinkSchema,
  transitFileOutputSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const archiveSerialNumberMaximum = 0xff_ff_ff_ff;

function charLookupFields(field: string, subject: string): Record<string, JsonSchema> {
  return {
    [`${field}__istartswith`]: s.string(`Only documents whose ${subject} starts with this text, ignoring case.`),
    [`${field}__iendswith`]: s.string(`Only documents whose ${subject} ends with this text, ignoring case.`),
    [`${field}__icontains`]: s.string(`Only documents whose ${subject} contains this text, ignoring case.`),
    [`${field}__iexact`]: s.string(`Only documents whose ${subject} equals this text, ignoring case.`),
  };
}

function dateLookupFields(field: string, subject: string): Record<string, JsonSchema> {
  return {
    [`${field}__year`]: s.integer(`Only documents whose ${subject} falls in this year, for example 2024.`),
    [`${field}__month`]: s.integer(`Only documents whose ${subject} falls in this month (1-12).`, {
      minimum: 1,
      maximum: 12,
    }),
    [`${field}__day`]: s.integer(`Only documents whose ${subject} falls on this day of the month (1-31).`, {
      minimum: 1,
      maximum: 31,
    }),
    [`${field}__gt`]: s.date(`Only documents whose ${subject} is after this date (YYYY-MM-DD, exclusive).`),
    [`${field}__gte`]: s.date(`Only documents whose ${subject} is on or after this date (YYYY-MM-DD, inclusive).`),
    [`${field}__lt`]: s.date(`Only documents whose ${subject} is before this date (YYYY-MM-DD, exclusive).`),
    [`${field}__lte`]: s.date(`Only documents whose ${subject} is on or before this date (YYYY-MM-DD, inclusive).`),
  };
}

function dateTimeLookupFields(field: string, subject: string): Record<string, JsonSchema> {
  return {
    [`${field}__year`]: s.integer(`Only documents ${subject} in this year, for example 2024.`),
    [`${field}__month`]: s.integer(`Only documents ${subject} in this month (1-12).`, {
      minimum: 1,
      maximum: 12,
    }),
    [`${field}__day`]: s.integer(`Only documents ${subject} on this day of the month (1-31).`, {
      minimum: 1,
      maximum: 31,
    }),
    [`${field}__date__gt`]: s.date(`Only documents ${subject} after this calendar date (YYYY-MM-DD, exclusive).`),
    [`${field}__date__gte`]: s.date(
      `Only documents ${subject} on or after this calendar date (YYYY-MM-DD, inclusive).`,
    ),
    [`${field}__date__lt`]: s.date(`Only documents ${subject} before this calendar date (YYYY-MM-DD, exclusive).`),
    [`${field}__date__lte`]: s.date(
      `Only documents ${subject} on or before this calendar date (YYYY-MM-DD, inclusive).`,
    ),
    [`${field}__gt`]: s.string(
      `Only documents ${subject} after this ISO 8601 timestamp, for example 2024-05-01T00:00:00Z (exclusive).`,
    ),
    [`${field}__gte`]: s.string(
      `Only documents ${subject} at or after this ISO 8601 timestamp, for example 2024-05-01T00:00:00Z (inclusive).`,
    ),
    [`${field}__lt`]: s.string(
      `Only documents ${subject} before this ISO 8601 timestamp, for example 2024-05-01T00:00:00Z (exclusive).`,
    ),
    [`${field}__lte`]: s.string(
      `Only documents ${subject} at or before this ISO 8601 timestamp, for example 2024-05-01T00:00:00Z (inclusive).`,
    ),
  };
}

function relatedObjectFilterFields(field: string, subject: string): Record<string, JsonSchema> {
  return {
    [`${field}__isnull`]: s.boolean(
      `When true, only documents without a ${subject}; when false, only documents that have one.`,
    ),
    [`${field}__id`]: idField(`Only documents whose ${subject} has this id.`),
    [`${field}__id__in`]: idArrayField(
      `Only documents whose ${subject} id is one of these values.`,
      `A ${subject} id.`,
    ),
    [`${field}__id__none`]: idArrayField(
      `Exclude documents whose ${subject} id is one of these values.`,
      `A ${subject} id.`,
    ),
    ...charLookupFields(`${field}__name`, `${subject} name`),
  };
}

const documentFilterInputFields: Record<string, JsonSchema> = {
  id: idField("Only the document with this id."),
  id__in: idArrayField("Only documents whose id is one of these values.", "A document id."),
  ...charLookupFields("title", "title"),
  archive_serial_number: s.integer("Only the document with exactly this archive serial number.", {
    minimum: 0,
    maximum: archiveSerialNumberMaximum,
  }),
  archive_serial_number__gt: s.integer("Only documents whose archive serial number is greater than this value.", {
    minimum: 0,
    maximum: archiveSerialNumberMaximum,
  }),
  archive_serial_number__gte: s.integer(
    "Only documents whose archive serial number is greater than or equal to this value.",
    { minimum: 0, maximum: archiveSerialNumberMaximum },
  ),
  archive_serial_number__lt: s.integer("Only documents whose archive serial number is less than this value.", {
    minimum: 0,
    maximum: archiveSerialNumberMaximum,
  }),
  archive_serial_number__lte: s.integer(
    "Only documents whose archive serial number is less than or equal to this value.",
    { minimum: 0, maximum: archiveSerialNumberMaximum },
  ),
  archive_serial_number__isnull: s.boolean(
    "When true, only documents without an archive serial number; when false, only documents that have one.",
  ),
  ...dateLookupFields("created", "creation date"),
  created__date__gt: s.date(
    "Alias of created__gt kept for backwards compatibility: only documents created after this date (YYYY-MM-DD, exclusive).",
  ),
  created__date__gte: s.date(
    "Alias of created__gte kept for backwards compatibility: only documents created on or after this date (YYYY-MM-DD, inclusive).",
  ),
  created__date__lt: s.date(
    "Alias of created__lt kept for backwards compatibility: only documents created before this date (YYYY-MM-DD, exclusive).",
  ),
  created__date__lte: s.date(
    "Alias of created__lte kept for backwards compatibility: only documents created on or before this date (YYYY-MM-DD, inclusive).",
  ),
  ...dateTimeLookupFields("added", "added to Paperless-ngx"),
  ...dateTimeLookupFields("modified", "last modified"),
  ...charLookupFields("original_filename", "original upload file name"),
  ...charLookupFields("checksum", "MD5 checksum of the original file"),
  ...relatedObjectFilterFields("correspondent", "correspondent"),
  tags__id: idField("Only documents carrying the tag with this id."),
  tags__id__in: idArrayField("Only documents carrying at least one of these tags.", "A tag id."),
  tags__id__all: idArrayField("Only documents carrying every one of these tags.", "A tag id."),
  tags__id__none: idArrayField("Exclude documents carrying any of these tags.", "A tag id."),
  ...charLookupFields("tags__name", "tag name"),
  ...relatedObjectFilterFields("document_type", "document type"),
  ...relatedObjectFilterFields("storage_path", "storage path"),
  owner__isnull: s.boolean("When true, only documents without an owner; when false, only owned documents."),
  owner__id: idField("Only documents owned by the user with this id."),
  owner__id__in: idArrayField("Only documents owned by one of these users.", "A user id."),
  owner__id__none: idArrayField("Exclude documents owned by any of these users.", "A user id."),
  is_tagged: s.boolean("When true, only documents with at least one tag; when false, only untagged documents."),
  is_in_inbox: s.boolean(
    "When true, only documents carrying an inbox tag; when false, only documents without any inbox tag.",
  ),
  title_content: s.string(
    "Deprecated database substring match on title or content, ignoring case. Prefer text, which uses the search index.",
  ),
  ...charLookupFields("content", "extracted text content"),
  custom_fields__icontains: s.string(
    "Deprecated: only documents with a custom field whose name or value contains this text, ignoring case. Prefer custom_field_query.",
  ),
  custom_fields__id__all: idArrayField(
    "Only documents that carry every one of these custom fields.",
    "A custom field id.",
  ),
  custom_fields__id__none: idArrayField(
    "Exclude documents that carry any of these custom fields.",
    "A custom field id.",
  ),
  custom_fields__id__in: idArrayField(
    "Only documents that carry at least one of these custom fields.",
    "A custom field id.",
  ),
  has_custom_fields: s.boolean(
    "When true, only documents with at least one custom field value; when false, only documents without any.",
  ),
  custom_field_query: s.string(
    'JSON expression filtering on custom field values, for example ["due", "range", ["2024-08-01", "2024-09-01"]], ["customer", "exact", "bob"], ["foo", "exists", false] or ["OR", [["address", "isnull", true], ["address", "exact", ""]]]. Every field type supports exact, in, isnull and exists; string, URL and monetary fields add icontains, istartswith and iendswith; integer, float and date fields add gt, gte, lt, lte and range; document link fields add contains. At most 10 nesting levels and 20 atoms.',
  ),
  shared_by__id: idField(
    "Only documents owned by the user with this id that have been shared with other users or groups.",
  ),
  mime_type: s.string(
    "Only documents whose original MIME type contains this text, ignoring case, for example application/pdf or image/.",
  ),
};

const documentSearchInputFields: Record<string, JsonSchema> = {
  query: s.string(
    "Advanced full text query evaluated by the search index, for example invoice AND tag:tax or correspondent:acme created:[2024 to 2025]. Results carry __search_hit__ and come back most relevant first unless ordering is given. Only one of query, text, title_search and more_like_id may be used per request.",
  ),
  text: s.string(
    "Simple substring-style search over title and content through the search index. Results carry __search_hit__. Only one of query, text, title_search and more_like_id may be used per request.",
  ),
  title_search: s.string(
    "Simple substring-style search over titles only through the search index. Results carry __search_hit__. Only one of query, text, title_search and more_like_id may be used per request.",
  ),
  more_like_id: idField(
    "Id of a document the connected user may view; returns documents with similar content, most similar first, each carrying __search_hit__. Only one of query, text, title_search and more_like_id may be used per request.",
  ),
};

const documentListViewInputFields: Record<string, JsonSchema> = {
  page: pageInputFields.page,
  page_size: pageInputFields.page_size,
  ordering: s.nonEmptyString(
    "Field to order by, prefixed with - for descending order. Accepted: id, title, correspondent__name, document_type__name, storage_path__name, created, modified, added, archive_serial_number, num_notes, owner, page_count, and custom_field_<id> to sort by a custom field (for example custom_field_3). Search requests additionally accept score. Defaults to -created.",
  ),
  truncate_content: s.boolean(
    "When true, content is cut to its first 550 characters to keep large pages small. Defaults to false.",
  ),
  fields: s.stringArray(
    "Names of the document fields to include in each result, for example id, title, created, tags and custom_fields. Fields not listed are omitted from the response; when not given every field is returned.",
    { itemDescription: "A document field name." },
  ),
  full_perms: fullPermsInputField,
  include_selection_data: s.boolean(
    "When true, the response also carries selection_data with per-object document counts (correspondents, tags, document types, storage paths and custom fields) across every matching document, not only the current page. Defaults to false.",
  ),
};

export const listDocumentsQueryParameterNames: readonly string[] = [
  ...Object.keys(documentListViewInputFields),
  ...Object.keys(documentSearchInputFields),
  ...Object.keys(documentFilterInputFields),
];

export const documentSearchParameterNames: readonly string[] = Object.keys(documentSearchInputFields);

const listDocumentsInputProperties: Record<string, JsonSchema> = {
  ...documentListViewInputFields,
  ...documentSearchInputFields,
  ...documentFilterInputFields,
  additional_filters: additionalFiltersInputField,
};

const listDocumentsInputSchema = s.object(
  "Pagination, search and filter parameters for the document list.",
  listDocumentsInputProperties,
  { optional: Object.keys(listDocumentsInputProperties) },
);

const selectionCountSchema = s.looseObject("Document count for one object.", {
  id: s.integer("The object id."),
  document_count: s.integer("Number of matching documents that reference the object."),
});

const selectionDataSchema = s.looseObject(
  "Per-object document counts across every matching document, only present when include_selection_data is true.",
  {
    selected_correspondents: s.array("Counts per correspondent.", selectionCountSchema),
    selected_tags: s.array("Counts per tag.", selectionCountSchema),
    selected_document_types: s.array("Counts per document type.", selectionCountSchema),
    selected_storage_paths: s.array("Counts per storage path.", selectionCountSchema),
    selected_custom_fields: s.array("Counts per custom field.", selectionCountSchema),
  },
);

const listDocumentsOutputSchema = paginatedOutputSchema("A page of documents.", documentSchema, {
  selection_data: selectionDataSchema,
  corrected_query: nullableString(
    "Reserved by Paperless-ngx for spelling suggestions on search requests; currently always null.",
  ),
});

const documentIdField = idField("Id of the document.");

const versionQueryInputField = idField(
  "Id of a specific file version of the document (see the versions array). Defaults to the latest version.",
);

const fieldsInputField = s.stringArray(
  "Names of the document fields to include in the response, for example id, title, content and custom_fields. Fields not listed are omitted; when not given every field is returned.",
  { itemDescription: "A document field name." },
);

const getDocumentInputSchema = s.object(
  "The document to read.",
  {
    id: documentIdField,
    full_perms: fullPermsInputField,
    fields: fieldsInputField,
    version: idField(
      "Id of a specific file version of the document (see the versions array); content is then taken from that version instead of the latest one.",
    ),
  },
  { optional: ["full_perms", "fields", "version"] },
);

export const updatableDocumentFields: readonly string[] = [
  "title",
  "content",
  "correspondent",
  "document_type",
  "storage_path",
  "tags",
  "created",
  "archive_serial_number",
  "custom_fields",
  "remove_inbox_tags",
  "owner",
  "set_permissions",
];

const updateDocumentInputSchema = s.object(
  "The document fields to change. Only the provided fields are sent; pass null to clear a nullable field.",
  {
    id: documentIdField,
    version: idField(
      "Id of the file version whose content should receive a content update (see the versions array). Defaults to the latest version. Metadata fields always update the root document.",
    ),
    title: s.string("New title, at most 128 characters.", { maxLength: 128 }),
    content: s.string(
      "Replacement for the extracted text content of the selected (default latest) file version. Re-indexed for search immediately.",
    ),
    correspondent: s.nullableInteger("Id of the correspondent to assign, or null to remove it."),
    document_type: s.nullableInteger("Id of the document type to assign, or null to remove it."),
    storage_path: s.nullableInteger("Id of the storage path to assign, or null to remove it."),
    tags: idArrayField(
      "Complete list of tag ids the document should carry; tags not listed are removed. Adding a child tag also adds its ancestors, and removing a parent removes its descendants.",
      "A tag id.",
    ),
    created: s.date("New creation date as YYYY-MM-DD. An ISO 8601 datetime is also accepted and reduced to its date."),
    archive_serial_number: s.nullableInteger(
      "New archive serial number (0 to 4294967295), or null to clear it. Must be unique, including among documents in the trash.",
      { minimum: 0, maximum: archiveSerialNumberMaximum },
    ),
    custom_fields: s.array(
      "Complete list of custom field values the document should carry; fields not listed are removed from the document.",
      customFieldInstanceInputSchema,
    ),
    remove_inbox_tags: s.boolean(
      "When true, every inbox tag is removed from the document as part of this update (except inbox tags being added by the tags field). Defaults to false.",
    ),
    owner: ownerInputField,
    set_permissions: setPermissionsInputSchema,
  },
  { optional: [...updatableDocumentFields, "version"] },
);

const metadataEntrySchema = s.looseObject(
  "A metadata entry extracted by the document parser, typically an XMP or PDF info field.",
  {
    namespace: s.string("Namespace URI of the entry."),
    prefix: s.string("Namespace prefix of the entry."),
    key: s.string("Metadata key."),
    value: s.string("Metadata value."),
  },
);

const documentMetadataOutputSchema = s.looseObject(
  "File-level metadata of the document, or of the requested version.",
  {
    original_checksum: s.string("MD5 checksum of the original file."),
    original_size: s.nullableInteger("Size of the original file in bytes, or null when the file is missing on disk."),
    original_mime_type: s.string("MIME type of the original file."),
    media_filename: nullableString("Path of the original file relative to the media directory, or null."),
    has_archive_version: s.boolean("Whether an archived PDF exists for this version."),
    original_metadata: s.nullable(
      s.array(
        "Parser metadata entries of the original file; empty when no parser handles the type, null when the file is missing.",
        metadataEntrySchema,
      ),
    ),
    archive_checksum: nullableString("MD5 checksum of the archived PDF, or null."),
    archive_media_filename: nullableString("Path of the archived PDF relative to the media directory, or null."),
    original_filename: nullableString("File name of the original upload, or null."),
    archive_size: s.nullableInteger("Size of the archived PDF in bytes, or null when there is no archive version."),
    archive_metadata: s.nullable(
      s.array(
        "Parser metadata entries of the archived PDF, or null when there is no archive version.",
        metadataEntrySchema,
      ),
    ),
    lang: s.string("Language detected from the content as an ISO 639-1 code; en when detection fails."),
  },
);

const documentSuggestionsOutputSchema = s.looseObject("Matching and classifier suggestions for the document.", {
  correspondents: s.array("Ids of suggested correspondents.", s.integer("A correspondent id.")),
  tags: s.array("Ids of suggested tags.", s.integer("A tag id.")),
  document_types: s.array("Ids of suggested document types.", s.integer("A document type id.")),
  storage_paths: s.array("Ids of suggested storage paths.", s.integer("A storage path id.")),
  dates: s.array(
    "Dates found in the file name or content, as YYYY-MM-DD, limited by PAPERLESS_NUMBER_OF_SUGGESTED_DATES.",
    s.string("A date as YYYY-MM-DD."),
  ),
});

const documentAiSuggestionsOutputSchema = s.looseObject(
  "Suggestions produced by the configured language model, resolved against existing objects the connected user may see.",
  {
    title: nullableString("Title proposed by the language model, or null."),
    tags: s.array("Ids of existing tags the model picked.", s.integer("A tag id.")),
    suggested_tags: s.array(
      "Names of new tags the model proposed that match no existing tag.",
      s.string("A proposed tag name."),
    ),
    correspondents: s.array("Ids of existing correspondents the model picked.", s.integer("A correspondent id.")),
    suggested_correspondents: s.array(
      "Names of new correspondents the model proposed that match no existing correspondent.",
      s.string("A proposed correspondent name."),
    ),
    document_types: s.array("Ids of existing document types the model picked.", s.integer("A document type id.")),
    suggested_document_types: s.array(
      "Names of new document types the model proposed that match no existing document type.",
      s.string("A proposed document type name."),
    ),
    storage_paths: s.array("Ids of existing storage paths the model picked.", s.integer("A storage path id.")),
    suggested_storage_paths: s.array(
      "Names of new storage paths the model proposed that match no existing storage path.",
      s.string("A proposed storage path name."),
    ),
    dates: s.array("Dates the model extracted, as YYYY-MM-DD.", s.string("A date as YYYY-MM-DD.")),
  },
);

const historyEntrySchema = s.looseObject("An audit log entry for the document.", {
  id: s.integer("The audit log entry id."),
  timestamp: s.string("ISO 8601 timestamp of the change."),
  action: s.string("Action label: create, update, delete or access."),
  changes: s.record(
    "Changed fields keyed by field name. Document entries map each field to a [old, new] pair; custom field entries carry a custom_fields object with type, field and value.",
    s.unknown("A change description."),
  ),
  actor: s.nullable(
    s.looseObject("The user who made the change, or null for system changes.", {
      id: s.integer("The user id."),
      username: s.string("The username."),
    }),
  ),
});

const downloadDocumentInputSchema = s.object(
  "The document file to download.",
  {
    id: documentIdField,
    original: s.boolean(
      "When true, download the original upload even when an archived PDF exists. Defaults to false, which prefers the archived PDF and falls back to the original.",
    ),
    version: versionQueryInputField,
    follow_formatting: s.boolean(
      "When true, name the file after the storage path template instead of the public title-based file name. Defaults to false.",
    ),
  },
  { optional: ["original", "version", "follow_formatting"] },
);

const notesOutputField = s.array("Every note on the document after the operation, newest first.", noteSchema);

const notesOutputSchema = s.requiredObject("The notes of the document.", {
  notes: notesOutputField,
});

const emailInputFields = {
  addresses: s.array(
    "Recipient email addresses; Paperless-ngx joins them with commas.",
    s.email("A recipient email address."),
    {
      minItems: 1,
    },
  ),
  subject: s.nonEmptyString("Email subject."),
  message: s.nonEmptyString("Email body text."),
  use_archive_version: s.boolean(
    "When true, attach the archived PDF of each document when one exists, otherwise the original file. Defaults to true.",
  ),
};

const emailOutputSchema = s.looseRequiredObject("The email result.", {
  message: s.string('Upstream confirmation, normally "Email sent".'),
});

const taskSubmittedOutputSchema = s.requiredObject("The queued consumption task.", {
  task_id: s.string(
    "Celery task UUID. Poll get_task with it until status is success or failure; on success result_data.document_id holds the id of the resulting document.",
  ),
});

const versionLabelInputField = nullableString(
  "Short label for the version, at most 64 characters. Empty or null clears the label.",
  { maxLength: 64 },
);

const uploadDocumentInputSchema = s.object(
  "The file to consume and the metadata to apply.",
  {
    file: transitFileInputField,
    fileName: fileNameInputField,
    title: s.string(
      "Title for the new document, at most 128 characters. Defaults to the file name without its extension.",
      { maxLength: 128 },
    ),
    created: s.string(
      "Creation date to record, as YYYY-MM-DD or an ISO 8601 datetime such as 2016-04-19T06:15:00+02:00; only the date part is kept. Defaults to a date found in the document, or the consumption time.",
    ),
    correspondent: idField("Id of the correspondent to assign."),
    document_type: idField("Id of the document type to assign."),
    storage_path: idField("Id of the storage path to assign."),
    tags: idArrayField("Ids of the tags to assign.", "A tag id."),
    archive_serial_number: s.integer(
      "Archive serial number to assign (0 to 4294967295). Must not be in use, including by documents in the trash.",
      { minimum: 0, maximum: archiveSerialNumberMaximum },
    ),
    custom_fields: s.array(
      "Custom field values to attach; pass null as the value to attach a field without a value. Sent to Paperless-ngx as its field id to value mapping.",
      customFieldInstanceInputSchema,
    ),
  },
  {
    optional: [
      "fileName",
      "title",
      "created",
      "correspondent",
      "document_type",
      "storage_path",
      "tags",
      "archive_serial_number",
      "custom_fields",
    ],
  },
);

const getTaskFollowUp = "paperless_ngx.get_task";

export const paperlessNgxDocumentActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_documents",
    operationType: "read",
    description:
      "List or search documents visible to the connected user, 25 per page by default. Filters mirror the Paperless-ngx query parameters: id, title, archive serial number, dates, correspondent, document type, storage path, tags, owner, custom fields, MIME type and content lookups can be combined; anything not modelled goes into additional_filters. query, text, title_search and more_like_id run a search-index query instead, returning results with __search_hit__ ordered by relevance, and only one of them may be used per call. Only root documents are listed; file versions appear inside each document's versions array. Requires the view_document permission.",
    requiredScopes: [],
    inputSchema: listDocumentsInputSchema,
    outputSchema: listDocumentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_document",
    operationType: "read",
    description:
      "Get one document with its metadata, tags, custom fields, notes, file versions and duplicate_documents (other documents sharing the same checksum). content holds the extracted text of the latest version unless version selects another one. Requires the view_document permission and view access to the document.",
    requiredScopes: [],
    inputSchema: getDocumentInputSchema,
    outputSchema: documentSchema,
  }),
  defineProviderAction(service, {
    name: "update_document",
    operationType: "write",
    description:
      "Partially update a document: title, content, correspondent, document type, storage path, tags, creation date, archive serial number, custom fields, inbox tag removal, owner and object permissions. Only the provided fields are sent (PATCH); tags and custom_fields replace the whole list. Changing owner or set_permissions requires being the owner or a superuser. The response carries the full permissions object. Requires the change_document permission and change access to the document.",
    requiredScopes: [],
    inputSchema: updateDocumentInputSchema,
    outputSchema: documentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_document",
    operationType: "destructive",
    description:
      "Move a document and all of its file versions to the trash. Trashed documents stay restorable until the configured trash delay (30 days by default) expires and are removed from the search index immediately. Requires the delete_document permission and delete access to the document.",
    requiredScopes: [],
    inputSchema: s.object("The document to delete.", { id: documentIdField }),
    outputSchema: deletedOutputSchema(
      "The deletion result.",
      "document_id",
      "Id of the document that was moved to the trash.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_document_root",
    operationType: "read",
    description:
      "Resolve the root document of any document id, including ids of file versions and trashed documents. For a root document the answer is its own id. Requires view access to the root document.",
    requiredScopes: [],
    inputSchema: s.object("The document or version to resolve.", {
      id: idField("Id of a document or of one of its file versions."),
    }),
    outputSchema: s.requiredObject("The resolved root document.", {
      root_id: s.integer("Id of the root document."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_metadata",
    operationType: "read",
    description:
      "Get file-level metadata of a document: checksums, sizes, MIME type, media file names, whether an archived PDF exists, parser metadata (such as PDF info and XMP fields) of the original and archived files, and the detected content language. Reads the latest version unless version is given. Requires view access to the document.",
    requiredScopes: [],
    inputSchema: s.object(
      "The document whose metadata to read.",
      { id: documentIdField, version: versionQueryInputField },
      { optional: ["version"] },
    ),
    outputSchema: documentMetadataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_document_suggestions",
    operationType: "read",
    description:
      "Get correspondent, tag, document type, storage path and date suggestions for a document from the matching rules and the trained classifier. Results are cached until the document or classifier changes. Requires change access to the document (403 otherwise).",
    requiredScopes: [],
    inputSchema: s.object("The document to get suggestions for.", { id: documentIdField }),
    outputSchema: documentSuggestionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_document_ai_suggestions",
    operationType: "read",
    description:
      "Ask the configured language model for a title, tags, correspondent, document type, storage path and dates for a document. Existing objects the model picked are returned as ids, new names it proposed are returned separately. Requires AI to be enabled on the instance: otherwise Paperless-ngx answers 400 AI is required for this feature, an invalid AI configuration yields 400 and a model timeout yields 503. The call blocks while the model answers, and requires change access to the document.",
    requiredScopes: [],
    inputSchema: s.object("The document to get AI suggestions for.", { id: documentIdField }),
    outputSchema: documentAiSuggestionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "download_document",
    operationType: "read",
    description:
      "Download the file of a document and hand it back as a local transit file. By default the archived PDF is served when it exists, otherwise the original upload; original=true always serves the original. The preview endpoint of Paperless-ngx serves exactly the same bytes with an inline disposition, so it is not exposed as a separate action. Works for trashed documents and file versions. Requires view access to the document; files above 200 MiB are rejected.",
    requiredScopes: [],
    inputSchema: downloadDocumentInputSchema,
    outputSchema: transitFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_document_thumbnail",
    operationType: "read",
    description:
      "Download the WebP thumbnail of a document (or of one of its file versions) and hand it back as a local transit file. Requires view access to the document.",
    requiredScopes: [],
    inputSchema: s.object(
      "The document whose thumbnail to download.",
      { id: documentIdField, version: versionQueryInputField },
      { optional: ["version"] },
    ),
    outputSchema: transitFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_document_notes",
    operationType: "read",
    description:
      "List the notes attached to a document, newest first, each with its author. Requires the view_note permission and view access to the document.",
    requiredScopes: [],
    inputSchema: s.object("The document whose notes to list.", { id: documentIdField }),
    outputSchema: notesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_document_note",
    operationType: "write",
    description:
      "Add a note to a document on behalf of the connected user and return the complete note list. Also bumps the document's modified timestamp and re-indexes it. Requires the add_note permission and change access to the document.",
    requiredScopes: [],
    inputSchema: s.object("The note to add.", {
      id: documentIdField,
      note: s.nonEmptyString("Text of the note."),
    }),
    outputSchema: notesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_document_note",
    operationType: "destructive",
    description:
      "Delete one note from a document and return the remaining notes. Requires the delete_note permission and change access to the document; a note id that does not belong to the document yields 404.",
    requiredScopes: [],
    inputSchema: s.object("The note to delete.", {
      id: documentIdField,
      note_id: idField("Id of the note to delete, as listed by list_document_notes."),
    }),
    outputSchema: extendObject(
      "The deletion result together with the remaining notes.",
      deletedOutputSchema("The deletion result.", "note_id", "Id of the note that was deleted."),
      { notes: notesOutputField },
    ),
  }),
  defineProviderAction(service, {
    name: "list_document_share_links",
    operationType: "read",
    description:
      "List the share links of a document that have not expired yet, newest first. Requires change access to the document (Paperless-ngx treats reading share links as a sharing operation).",
    requiredScopes: [],
    inputSchema: s.object("The document whose share links to list.", { id: documentIdField }),
    outputSchema: s.requiredObject("The active share links of the document.", {
      share_links: s.array("Unexpired share links, newest first.", shareLinkSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document_history",
    operationType: "read",
    description:
      "Get the audit trail of a document: every logged create, update, delete and access entry for the document and its custom field values, newest first, with the changed fields and the acting user. Requires the audit log to be enabled on the instance (PAPERLESS_AUDIT_LOG_ENABLED, otherwise 400 Audit log is disabled), the auditlog.view_logentry permission, and the connected user must own the document, be a superuser, or the document must be unowned.",
    requiredScopes: [],
    inputSchema: s.object("The document whose history to read.", { id: documentIdField }),
    outputSchema: s.requiredObject("The audit trail of the document.", {
      entries: s.array("Audit log entries, newest first.", historyEntrySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "email_document",
    operationType: "write",
    description:
      "Send one document as an email attachment through the mail server configured on the Paperless-ngx instance. The archived PDF is attached when it exists unless use_archive_version is false. Paperless-ngx routes this through its collection email endpoint with a single document id. Requires the view_document permission, view access to the document and a configured outgoing mail server (otherwise a 500 Error emailing documents).",
    requiredScopes: [],
    inputSchema: s.object(
      "The document to email and the message to send.",
      { id: documentIdField, ...emailInputFields },
      { optional: ["use_archive_version"] },
    ),
    outputSchema: emailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "email_documents",
    operationType: "write",
    description:
      "Send several documents as attachments of one email through the mail server configured on the Paperless-ngx instance. Archived PDFs are attached when they exist unless use_archive_version is false. Requires the view_document permission, view access to every document (403 otherwise) and a configured outgoing mail server (otherwise a 500 Error emailing documents).",
    requiredScopes: [],
    inputSchema: s.object(
      "The documents to email and the message to send.",
      {
        documents: s.array(
          "Ids of the documents to attach; every id must exist and appear once.",
          s.positiveInteger("A document id."),
          { minItems: 1 },
        ),
        ...emailInputFields,
      },
      { optional: ["use_archive_version"] },
    ),
    outputSchema: emailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_document_version",
    operationType: "write",
    description:
      "Upload a new file version for a document. The connector reads the supplied local transit file and posts it as multipart form field document; Paperless-ngx consumes it in the background as a new version of the root document, keeping title, tags and other metadata shared. Returns the Celery task id to poll with get_task. Requires the change_document permission and change access to the root document; unsupported file types are rejected with 400.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "paperless_ngx.update_document_version",
      statusActionId: "paperless_ngx.get_task",
    },
    followUpActions: [getTaskFollowUp],
    inputSchema: s.object(
      "The document to add a version to and the file to upload.",
      {
        id: documentIdField,
        file: transitFileInputField,
        fileName: fileNameInputField,
        version_label: versionLabelInputField,
      },
      { optional: ["fileName", "version_label"] },
    ),
    outputSchema: taskSubmittedOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_document_version",
    operationType: "destructive",
    description:
      "Permanently delete one non-root file version of a document. The root (original) version cannot be deleted this way; delete the document instead (400 otherwise). Requires delete access to the root document.",
    requiredScopes: [],
    inputSchema: s.object("The version to delete.", {
      id: idField("Id of the document (or of any of its versions; the root is resolved)."),
      version_id: idField("Id of the file version to delete, as listed in the versions array."),
    }),
    outputSchema: extendObject("The deletion result.", resultOutputSchema, {
      current_version_id: s.integer("Id of the newest remaining version after the deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_document_version_label",
    operationType: "write",
    description:
      "Set or clear the label of one file version of a document, including the root version. Requires change access to the root document.",
    requiredScopes: [],
    inputSchema: s.object("The version and its new label.", {
      id: idField("Id of the document (or of any of its versions; the root is resolved)."),
      version_id: idField("Id of the file version to relabel, as listed in the versions array."),
      version_label: versionLabelInputField,
    }),
    outputSchema: documentVersionSchema,
  }),
  defineProviderAction(service, {
    name: "get_next_asn",
    operationType: "read",
    description:
      "Get the next free archive serial number: the highest ASN currently in use plus one, or 1 when none is assigned. Trashed documents keep their ASN reserved.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.requiredObject("The next archive serial number.", {
      next_asn: s.integer("The next free archive serial number."),
    }),
  }),
  defineProviderAction(service, {
    name: "upload_document",
    operationType: "write",
    description:
      "Upload a file for consumption as a new document. The connector reads the supplied local transit file (at most 100 MiB) and posts it as multipart form field document together with the optional title, creation date, correspondent, document type, storage path, tags, archive serial number and custom field values. Paperless-ngx sniffs the file type from the bytes and rejects unsupported types with 400; consumption (OCR, matching, workflows) runs in the background, so the action returns the Celery task id to poll with get_task, whose result_data.document_id identifies the new document once it succeeded. The connected user becomes the owner. Requires the add_document permission.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "paperless_ngx.upload_document",
      statusActionId: "paperless_ngx.get_task",
    },
    followUpActions: [getTaskFollowUp, "paperless_ngx.get_document"],
    inputSchema: uploadDocumentInputSchema,
    outputSchema: taskSubmittedOutputSchema,
  }),
];
