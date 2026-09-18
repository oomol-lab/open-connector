import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { nullableString } from "./schemas.ts";
import {
  documentSchema,
  documentSelectionInputFields,
  fullPermsInputField,
  idArrayField,
  idField,
  pageInputFields,
  paginatedOutputSchema,
  resultOutputSchema,
  transitFileOutputSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const documentSelectionOptionalFields = ["documents", "all", "filters"];

const changePermissionNote =
  "Requires the global change_document permission plus change access on every selected document (403 Insufficient permissions otherwise); superusers bypass these checks.";

const sourceModeInputField = s.stringEnum(
  "Which file of each selected document is used as the source. latest_version (default) resolves a selected root document to its newest version, while an explicitly selected version id is always used as is; explicit_selection uses exactly the selected document's own file even when newer versions exist.",
  ["latest_version", "explicit_selection"],
);

const updateDocumentInputField = s.boolean(
  "When true, the resulting PDF is consumed as a new version of the same document instead of as a new document. Defaults to false.",
);

const includeMetadataInputField = s.boolean(
  "When true (default), the new document or version copies the metadata of the original (correspondent, document type, tags, storage path, custom fields, permissions). When false it starts empty.",
);

const deleteOriginalInputField = s.boolean(
  "When true and update_document is false, move the original document to the trash after the new document has been consumed. Defaults to false. Requires the global delete_document permission.",
);

const requiredDocumentsInputField = idArrayField(
  "Ids of the documents to operate on. Every id must exist (400 otherwise); the all/filters selection is not supported by this endpoint.",
  "A document id.",
);

const bulkEditMethodDescription = [
  "The bulk edit method. Current methods and the keys they need in parameters:",
  "set_correspondent (correspondent: id or null),",
  "set_document_type (document_type: id or null),",
  "set_storage_path (storage_path: id or null),",
  "add_tag / remove_tag (tag: id),",
  "modify_tags (add_tags and remove_tags: arrays of tag ids, both required, may be empty),",
  "modify_custom_fields (add_custom_fields: object of custom field id to value, or an array of ids to add with empty values; remove_custom_fields: array of ids; both required),",
  "set_permissions (set_permissions: { view: { users, groups }, change: { users, groups } } required; owner: user id or null; merge: boolean, default false meaning the given owner and permissions replace the existing ones instead of being merged).",
  'Legacy methods still accepted by API v10 but deprecated (prefer the dedicated actions): delete (no parameters; use delete_documents), reprocess (remote_ocr; use reprocess_documents), rotate (degrees; use rotate_documents), merge (metadata_document_id, delete_originals, archive_fallback; use merge_documents), split (pages as a string such as "1-3,4,5-7" plus delete_originals; use edit_document_pdf with doc indexes), delete_pages (pages as an array of page numbers; use edit_document_pdf listing only the pages to keep), edit_pdf (operations, update_document, include_metadata, delete_original; use edit_document_pdf) and remove_password (password, update_document, delete_original, include_metadata; use remove_document_password).',
  "The legacy PDF methods also accept source_mode. merge, split, delete_pages, edit_pdf and remove_password reject all=true, and split, delete_pages and edit_pdf accept exactly one document.",
].join(" ");

const bulkEditMethodValues = [
  "set_correspondent",
  "set_document_type",
  "set_storage_path",
  "add_tag",
  "remove_tag",
  "modify_tags",
  "modify_custom_fields",
  "set_permissions",
  "delete",
  "reprocess",
  "rotate",
  "merge",
  "split",
  "delete_pages",
  "edit_pdf",
  "remove_password",
];

const bulkEditInputSchema = s.object(
  "The bulk edit request.",
  {
    ...documentSelectionInputFields,
    method: s.stringEnum(bulkEditMethodDescription, bulkEditMethodValues),
    parameters: s.record(
      "Method-specific parameters keyed by the upstream parameter names listed under method. Defaults to an empty object, which is only valid for the legacy delete method.",
      s.unknown("A parameter value: id, null, boolean, array of ids, or an object depending on the method."),
    ),
  },
  { optional: [...documentSelectionOptionalFields, "parameters"] },
);

const operationResultOutputSchema: JsonSchema = s.looseRequiredObject(
  'The upstream operation result. Paperless-ngx 3.x answers { "result": "OK" } once the change has been applied or its background work has been queued; this endpoint does not return task ids, use list_tasks to follow the consumption tasks.',
  {
    result: s.string('The upstream result marker, normally "OK".'),
  },
);

const pdfOperationInputSchema = s.object(
  "One page of the output. page names the 1-based page of the source PDF, rotate optionally rotates that page, and doc optionally routes it to an output document.",
  {
    page: s.positiveInteger(
      "1-based page number of the source document. Must not exceed the document's page count when it is known.",
    ),
    rotate: s.integer(
      "Clockwise rotation applied to this page in degrees, a multiple of 90 such as 90, 180 or 270. Omit or use 0 for no rotation.",
    ),
    doc: s.nonNegativeInteger(
      "Zero-based index of the output document that receives this page. Defaults to 0; using several indexes splits the source into several documents. Only index 0 is allowed when update_document is true.",
    ),
  },
  { optional: ["rotate", "doc"] },
);

const selectionCountSchema = s.looseObject("How many of the given documents use this object.", {
  id: s.integer("The object id."),
  document_count: s.integer("Number of the given documents that use this object; 0 when none of them do."),
});

const selectionDataOutputSchema = s.looseRequiredObject(
  "Usage counts of every correspondent, tag, document type, storage path and custom field across the given documents. Every object of each kind is listed, including those with document_count 0.",
  {
    selected_correspondents: s.array("Correspondent usage counts.", selectionCountSchema),
    selected_tags: s.array("Tag usage counts.", selectionCountSchema),
    selected_document_types: s.array("Document type usage counts.", selectionCountSchema),
    selected_storage_paths: s.array("Storage path usage counts.", selectionCountSchema),
    selected_custom_fields: s.array("Custom field usage counts.", selectionCountSchema),
  },
);

const trashResultOutputSchema = s.looseRequiredObject("The trash operation result.", {
  result: s.string('The upstream result marker, normally "OK".'),
  doc_ids: s.nullable(
    s.array(
      "Ids of the documents the action was applied to. For empty_trash without documents this is the list of trashed documents Paperless-ngx selected on your behalf.",
      s.integer("A document id."),
    ),
  ),
});

const trashedDocumentsInputField = idArrayField(
  "Ids of trashed documents. Every id must currently be in the trash (400 otherwise).",
  "A trashed document id.",
);

const listTasksFollowUp = "paperless_ngx.list_tasks";

export const paperlessNgxDocumentOperationActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "bulk_edit_documents",
    operationType: "destructive",
    description:
      "Apply one metadata change to many documents at once: set the correspondent, document type or storage path, add or remove tags, add or remove custom fields, or replace owner and permissions. Select documents explicitly or with all plus filters. Metadata methods require the global change_document permission plus change access on every document; set_permissions additionally requires that the connected user owns every document (or it is unowned) unless they are a superuser. Legacy document-editing methods (delete, reprocess, rotate, merge, split, delete_pages, edit_pdf, remove_password) are still accepted but deprecated; use the dedicated actions instead.",
    requiredScopes: [],
    inputSchema: bulkEditInputSchema,
    outputSchema: resultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_documents",
    operationType: "destructive",
    description: `Move documents to the trash (soft delete). Versions of a selected root document are trashed with it. Trashed documents can be listed with list_trash and brought back with restore_trash_documents until the trash is emptied, which happens automatically after the instance's trash delay (30 days by default). ${changePermissionNote} Also requires the global delete_document permission and that the connected user owns every document (or it is unowned).`,
    requiredScopes: [],
    inputSchema: s.object(
      "Which documents to move to the trash. Provide documents, or all with optional filters.",
      documentSelectionInputFields,
      { optional: [...documentSelectionOptionalFields] },
    ),
    outputSchema: resultOutputSchema,
    followUpActions: ["paperless_ngx.list_trash", "paperless_ngx.restore_trash_documents"],
  }),
  defineProviderAction(service, {
    name: "reprocess_documents",
    operationType: "destructive",
    description: `Re-run parsing (text extraction, OCR and archive PDF generation) for documents from their original files. Each document is queued as a separate background task and its content and archive file are replaced when the task finishes; the response is OK as soon as the tasks are queued. ${changePermissionNote}`,
    requiredScopes: [],
    inputSchema: s.object(
      "Which documents to reprocess and how.",
      {
        ...documentSelectionInputFields,
        remote_ocr: s.boolean(
          "When true, send the documents to the configured remote OCR engine instead of the local one. Defaults to false.",
        ),
      },
      { optional: [...documentSelectionOptionalFields, "remote_ocr"] },
    ),
    outputSchema: operationResultOutputSchema,
    followUpActions: [listTasksFollowUp],
  }),
  defineProviderAction(service, {
    name: "rotate_documents",
    operationType: "write",
    description: `Rotate every page of the selected PDF documents by the given number of degrees. The rotated file is consumed in the background as a new version of each root document, keeping its metadata; documents that are not PDFs are skipped with a warning while the response is still OK. ${changePermissionNote} Also requires that the connected user owns every document (or it is unowned).`,
    requiredScopes: [],
    inputSchema: s.object(
      "Which documents to rotate and by how much.",
      {
        ...documentSelectionInputFields,
        degrees: s.integer(
          "Clockwise rotation in degrees, a multiple of 90 such as 90, 180, 270 or -90. Other values make the rotation fail per document.",
        ),
        source_mode: sourceModeInputField,
      },
      { optional: [...documentSelectionOptionalFields, "source_mode"] },
    ),
    outputSchema: operationResultOutputSchema,
    followUpActions: [listTasksFollowUp],
  }),
  defineProviderAction(service, {
    name: "merge_documents",
    operationType: "write",
    description: `Merge the PDFs of the given documents, in the given order, into a single new document that is consumed in the background and owned by the connected user. Documents whose file cannot be read as a PDF are skipped. With metadata_document_id the new document copies that document's metadata and takes its title with " (merged)" appended. ${changePermissionNote} Also requires the global add_document permission; with delete_originals the global delete_document permission and ownership of every document are required as well.`,
    requiredScopes: [],
    inputSchema: s.object(
      "The documents to merge and the merge options.",
      {
        documents: idArrayField(
          "Ids of the documents to merge, in the order their pages should appear. Every id must exist.",
          "A document id.",
        ),
        metadata_document_id: s.nullableInteger(
          "Id of one of the selected documents whose metadata (correspondent, document type, tags, storage path, custom fields, permissions) and title are copied to the merged document. Null or omitted starts with empty metadata.",
        ),
        delete_originals: s.boolean(
          "When true, move the original documents to the trash after the merged document has been consumed, handing their first archive serial number over to it. Defaults to false.",
        ),
        archive_fallback: s.boolean(
          "When true, non-PDF originals contribute their archived PDF instead of being skipped. Defaults to false.",
        ),
        source_mode: sourceModeInputField,
      },
      { optional: ["metadata_document_id", "delete_originals", "archive_fallback", "source_mode"] },
    ),
    outputSchema: operationResultOutputSchema,
    followUpActions: [listTasksFollowUp],
  }),
  defineProviderAction(service, {
    name: "merge_documents_as_versions",
    operationType: "destructive",
    description: `Turn existing top-level documents into file versions of one root document without creating a new file. The source documents disappear from the document list, give up their archive serial numbers (the root takes the first one if it has none) and become versions of the root, effective immediately. Only top-level documents can be selected and the sources must not have versions of their own. ${changePermissionNote} Also requires ownership of every document (or that it is unowned) and the global delete_document permission.`,
    requiredScopes: [],
    inputSchema: s.object(
      "The documents to combine and which of them stays the root.",
      {
        documents: idArrayField(
          "Ids of at least two top-level documents: the root document and the documents that become its versions.",
          "A document id.",
        ),
        root_document_id: idField("Id of the document that remains the root. Must be one of documents."),
        version_label: nullableString(
          "Optional label for the new version, at most 64 characters. Only allowed when exactly two documents are given (one root and one source); whitespace-only labels are stored as null.",
          { maxLength: 64 },
        ),
      },
      { optional: ["version_label"] },
    ),
    outputSchema: operationResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "edit_document_pdf",
    operationType: "destructive",
    description: `Rebuild the PDF of one document from a list of page operations: keep, reorder, duplicate, rotate or drop pages, and optionally split them into several output documents. By default each output is consumed in the background as a new document owned by the connected user (metadata copied when include_metadata is true), and delete_original then trashes the source afterwards, handing its archive serial number over when there is a single output. With update_document true, a single output is consumed as a new version of the same document instead. ${changePermissionNote} Also requires ownership of the document (or that it is unowned), the global add_document permission unless update_document is true, and the global delete_document permission when delete_original is true.`,
    requiredScopes: [],
    inputSchema: s.object(
      "The document to edit and the page operations.",
      {
        documents: s.array(
          "Exactly one document id: the document whose PDF is edited.",
          s.positiveInteger("The document id."),
          { minItems: 1, maxItems: 1 },
        ),
        operations: s.array(
          "Ordered list describing the pages of the output PDF(s). Each entry names the 1-based source page in page, may rotate it and may route it to an output document index in doc. Pages not listed are discarded and a page may be listed more than once.",
          pdfOperationInputSchema,
          { minItems: 1 },
        ),
        update_document: updateDocumentInputField,
        include_metadata: includeMetadataInputField,
        delete_original: deleteOriginalInputField,
        source_mode: sourceModeInputField,
      },
      { optional: ["update_document", "include_metadata", "delete_original", "source_mode"] },
    ),
    outputSchema: operationResultOutputSchema,
    followUpActions: [listTasksFollowUp],
  }),
  defineProviderAction(service, {
    name: "remove_document_password",
    operationType: "destructive",
    description: `Remove the password protection from encrypted PDF documents using the given password. Documents that are not encrypted are skipped. By default the unprotected PDF is consumed in the background as a new document owned by the connected user (metadata copied when include_metadata is true) and delete_original then trashes the protected original; with update_document true it becomes a new version of the same document instead. A wrong password fails the whole request with 400. ${changePermissionNote} Also requires ownership of every document (or that it is unowned), the global add_document permission unless update_document is true, and the global delete_document permission when delete_original is true without update_document.`,
    requiredScopes: [],
    inputSchema: s.object(
      "The protected documents and the password that opens them.",
      {
        documents: requiredDocumentsInputField,
        password: s.nonEmptyString("The password that opens the selected PDFs."),
        update_document: updateDocumentInputField,
        include_metadata: includeMetadataInputField,
        delete_original: deleteOriginalInputField,
        source_mode: sourceModeInputField,
      },
      { optional: ["update_document", "include_metadata", "delete_original", "source_mode"] },
    ),
    outputSchema: operationResultOutputSchema,
    followUpActions: [listTasksFollowUp],
  }),
  defineProviderAction(service, {
    name: "bulk_download_documents",
    operationType: "read",
    description:
      "Download several documents as one zip archive handed back as a local transit file. Select documents explicitly or with all plus filters; the latest version of each root document is packed. content chooses archived PDFs (falling back to the original when a document has no archive version), original files, or both, and follow_formatting names the entries after the configured filename format instead of the document title. The zip is built on the instance and may take a while; it must stay under the 500 MiB connector limit. Requires view access to every document (403 otherwise).",
    requiredScopes: [],
    inputSchema: s.object(
      "Which documents to download and how to pack them.",
      {
        ...documentSelectionInputFields,
        content: s.stringEnum(
          "Which files to include: archive (default) for the archived PDF of each document, originals for the uploaded files, or both.",
          ["archive", "originals", "both"],
        ),
        compression: s.stringEnum("Zip compression method: none (default, stored), deflated, bzip2 or lzma.", [
          "none",
          "deflated",
          "bzip2",
          "lzma",
        ]),
        follow_formatting: s.boolean(
          "When true, name the files inside the zip using the instance's filename format (storage path template) instead of the document title. Defaults to false.",
        ),
      },
      {
        optional: [...documentSelectionOptionalFields, "content", "compression", "follow_formatting"],
      },
    ),
    outputSchema: transitFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_selection_data",
    operationType: "read",
    description:
      "For a set of documents, count how many of them use each correspondent, tag, document type, storage path and custom field. Every object of each kind is returned, including those used by none of the documents, so a caller can tell whether an object applies to all, some or none of the selection before a bulk edit. Every document must exist (400 otherwise) and be visible to the connected user (403 otherwise).",
    requiredScopes: [],
    inputSchema: s.object("The documents to inspect.", {
      documents: idArrayField(
        "Ids of the documents to inspect. Every id must exist and be visible to the connected user.",
        "A document id.",
      ),
    }),
    outputSchema: selectionDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_trash",
    operationType: "read",
    description:
      "List the documents currently in the trash (soft deleted), newest created first, with the same fields as a regular document plus deleted_at. Superusers see every trashed document; other users only see trashed documents they own or that are unowned, explicit shares do not count. This endpoint supports pagination only, no filters or ordering.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for the trash listing.",
      {
        page: pageInputFields.page,
        page_size: pageInputFields.page_size,
        full_perms: fullPermsInputField,
      },
      { optional: ["page", "page_size", "full_perms"] },
    ),
    outputSchema: paginatedOutputSchema("A page of trashed documents.", documentSchema),
  }),
  defineProviderAction(service, {
    name: "restore_trash_documents",
    operationType: "write",
    description:
      "Restore documents from the trash so they appear in the document list again and are re-added to the search index. Every id must be a trashed document (400 otherwise) and the connected user needs delete permission on each of them (403 otherwise).",
    requiredScopes: [],
    inputSchema: s.object("The trashed documents to restore.", {
      documents: trashedDocumentsInputField,
    }),
    outputSchema: trashResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "empty_trash",
    operationType: "destructive",
    description:
      "Permanently delete trashed documents together with their files. When documents is omitted, every trashed document the connected user sees in list_trash is deleted (all of them for a superuser). This cannot be undone. The connected user needs delete permission on each affected document (403 otherwise).",
    requiredScopes: [],
    inputSchema: s.object(
      "Which trashed documents to delete permanently.",
      {
        documents: idArrayField(
          "Ids of trashed documents to delete permanently. Every id must currently be in the trash (400 otherwise). Omit to empty the whole trash visible to the connected user.",
          "A trashed document id.",
        ),
      },
      { optional: ["documents"] },
    ),
    outputSchema: trashResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "chat_with_documents",
    operationType: "read",
    description:
      "Ask the Paperless-ngx AI assistant a question that is answered from your documents (retrieval-augmented generation over the LLM index). With document_id the answer is based only on that document, which must exist (400 Document not found otherwise) and be viewable by the connected user (403 otherwise); without it every document visible to the user is searched. Requires AI to be enabled in the application configuration (400 AI is required for this feature otherwise), the global view_document permission and a built LLM index. Paperless-ngx streams the reply; the connector waits for the stream to finish and returns the whole text.",
    requiredScopes: [],
    inputSchema: s.object(
      "The question to ask.",
      {
        q: s.nonEmptyString("The question, at most 4000 characters.", { maxLength: 4000 }),
        document_id: idField(
          "Id of a single document to restrict the answer to. Omit to search all visible documents.",
        ),
      },
      { optional: ["document_id"] },
    ),
    outputSchema: s.requiredObject("The assistant's answer.", {
      answer: s.string(
        "The complete answer text: the streamed UTF-8 text chunks concatenated verbatim in arrival order, exactly as the Paperless-ngx web UI displays them, without any SSE framing.",
      ),
    }),
  }),
];
