import type { PaperlessExecutionContext, PaperlessHandlerMap, PaperlessQueryValue } from "./runtime-helpers.ts";

import { requiredString, requiredStringArray } from "../../core/cast.ts";
import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRecord,
} from "../../core/cast.ts";
import { readTransitFileInput } from "../provider-files.ts";
import { providerResponseError } from "../provider-runtime.ts";
import { providerInputError, ProviderRequestError, requiredResponseRecord } from "../provider-runtime.ts";
import {
  documentSearchParameterNames,
  listDocumentsQueryParameterNames,
  updatableDocumentFields,
} from "./actions-documents.ts";
import { paperlessResponseObjectArray } from "./runtime-helpers.ts";
import { paperlessResponseInteger } from "./runtime-helpers.ts";
import {
  deletedResult,
  encodePaperlessId,
  guessPaperlessFileExtension,
  normalizePaperlessPage,
  paperlessChatTimeoutMs,
  paperlessFileTransferTimeoutMs,
  paperlessMaxDownloadBytes,
  paperlessMaxUploadBytes,
  pickProvidedFields,
  readPaperlessMimeType,
  readPaperlessResponseFileName,
  requirePaperlessFileTransit,
  requirePaperlessInputString,
  requirePaperlessUpdateFields,
  streamPaperlessResponseToTransit,
} from "./runtime-helpers.ts";

const defaultUploadFileName = "document";

function documentPath(id: unknown, suffix = ""): string {
  return `/api/documents/${encodePaperlessId(id, "id")}/${suffix}`;
}

function readAdditionalFilters(value: unknown): Record<string, PaperlessQueryValue> {
  return (optionalRecord(value) ?? {}) as Record<string, PaperlessQueryValue>;
}

function readNoteList(value: unknown): Record<string, unknown>[] {
  const failure = optionalString(optionalRecord(value)?.error)?.trim();
  if (failure) {
    throw new ProviderRequestError(
      502,
      `Paperless-ngx could not process the note request: ${failure}`,
      undefined,
      "provider_error",
    );
  }
  return paperlessResponseObjectArray(value, "Paperless-ngx document notes response");
}

function buildEmailBody(input: Record<string, unknown>, documents: number[]): Record<string, unknown> {
  const addresses = requiredStringArray(input.addresses, "addresses", providerInputError)
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
  if (addresses.length === 0) {
    throw new ProviderRequestError(400, "addresses must contain at least one email", undefined, "invalid_input");
  }
  return compactObject({
    documents,
    addresses: addresses.join(","),
    subject: requirePaperlessInputString(input.subject, "subject"),
    message: requirePaperlessInputString(input.message, "message"),
    use_archive_version: optionalBoolean(input.use_archive_version),
  });
}

async function sendDocumentEmail(
  context: PaperlessExecutionContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return requiredResponseRecord(
    await context.request({ method: "POST", path: "/api/documents/email/", body }),
    "Paperless-ngx email response",
  );
}

async function buildDocumentFormData(
  context: PaperlessExecutionContext,
  fileInput: unknown,
  fileNameInput: unknown,
): Promise<FormData> {
  const upload = await readTransitFileInput(fileInput, context);
  if (upload.sizeBytes === 0) {
    throw new ProviderRequestError(400, "file is empty", undefined, "invalid_input");
  }
  if (upload.sizeBytes > paperlessMaxUploadBytes) {
    throw new ProviderRequestError(
      413,
      `file exceeds the ${paperlessMaxUploadBytes} byte limit`,
      undefined,
      "invalid_input",
    );
  }
  const fileName = optionalString(fileNameInput) ?? upload.name ?? defaultUploadFileName;
  const body = new FormData();
  body.append("document", upload.file, fileName);
  return body;
}

function appendFormText(body: FormData, name: string, value: string | undefined): void {
  const text = value?.trim();
  if (text) body.append(name, text);
}

function appendFormId(body: FormData, name: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    body.append(name, encodePaperlessId(value, name));
  }
}

function buildUploadCustomFields(value: unknown): Record<string, unknown> | undefined {
  const entries = looseArray(value);
  if (entries.length === 0) return undefined;
  const mapping: Record<string, unknown> = {};
  for (const entry of entries) {
    const record = requiredRecord(entry, "custom_fields", providerInputError);
    mapping[encodePaperlessId(record.field, "custom_fields.field")] = record.value ?? null;
  }
  return mapping;
}

async function requestSubmittedTask(
  context: PaperlessExecutionContext,
  path: string,
  body: FormData,
): Promise<{ task_id: string }> {
  return {
    task_id: requiredString(
      await context.requestMultipart({
        method: "POST",
        path,
        body,
        timeoutMs: paperlessFileTransferTimeoutMs,
      }),
      "Paperless-ngx consumption task id",
      providerResponseError,
    ),
  };
}

export const paperlessNgxDocumentActionHandlers: PaperlessHandlerMap = {
  async list_documents(context, input) {
    const activeSearchParameters = documentSearchParameterNames.filter((name) => input[name] !== undefined);
    if (activeSearchParameters.length > 1) {
      throw new ProviderRequestError(
        400,
        `Specify only one of ${documentSearchParameterNames.join(", ")}; received ${activeSearchParameters.join(", ")}`,
        undefined,
        "invalid_input",
      );
    }
    const query: Record<string, PaperlessQueryValue> = {
      ...(pickProvidedFields(input, listDocumentsQueryParameterNames) as Record<string, PaperlessQueryValue>),
      ...readAdditionalFilters(input.additional_filters),
    };
    return normalizePaperlessPage(
      await context.request({ path: "/api/documents/", query }),
      "Paperless-ngx document list response",
    );
  },

  async get_document(context, input) {
    return requiredResponseRecord(
      await context.request({
        path: documentPath(input.id),
        query: {
          full_perms: optionalBoolean(input.full_perms),
          fields: optionalStringArray(input.fields),
          version: optionalInteger(input.version),
        },
      }),
      "Paperless-ngx document response",
    );
  },

  async update_document(context, input) {
    const body = requirePaperlessUpdateFields(pickProvidedFields(input, updatableDocumentFields));
    return requiredResponseRecord(
      await context.request({
        method: "PATCH",
        path: documentPath(input.id),
        query: { version: optionalInteger(input.version) },
        body,
      }),
      "Paperless-ngx document update response",
    );
  },

  async delete_document(context, input) {
    const documentId = encodePaperlessId(input.id, "id");
    await context.request({
      method: "DELETE",
      path: `/api/documents/${documentId}/`,
      expectJson: false,
    });
    return deletedResult({ document_id: Number(documentId) });
  },

  async get_document_root(context, input) {
    const result = requiredResponseRecord(
      await context.request({ path: documentPath(input.id, "root/") }),
      "Paperless-ngx document root response",
    );
    return {
      root_id: paperlessResponseInteger(result.root_id, "Paperless-ngx document root id"),
    };
  },

  async get_document_metadata(context, input) {
    return requiredResponseRecord(
      await context.request({
        path: documentPath(input.id, "metadata/"),
        query: { version: optionalInteger(input.version) },
      }),
      "Paperless-ngx document metadata response",
    );
  },

  async get_document_suggestions(context, input) {
    return requiredResponseRecord(
      await context.request({ path: documentPath(input.id, "suggestions/") }),
      "Paperless-ngx document suggestions response",
    );
  },

  async get_document_ai_suggestions(context, input) {
    return requiredResponseRecord(
      await context.request({
        path: documentPath(input.id, "ai_suggestions/"),
        timeoutMs: paperlessChatTimeoutMs,
      }),
      "Paperless-ngx document AI suggestions response",
    );
  },

  async download_document(context, input) {
    const documentId = encodePaperlessId(input.id, "id");
    requirePaperlessFileTransit(context);
    return context.requestRaw(
      {
        path: `/api/documents/${documentId}/download/`,
        query: {
          original: input.original === true ? true : undefined,
          follow_formatting: input.follow_formatting === true ? true : undefined,
          version: optionalInteger(input.version),
        },
        timeoutMs: paperlessFileTransferTimeoutMs,
      },
      (response) =>
        streamPaperlessResponseToTransit(context, {
          response,
          name:
            readPaperlessResponseFileName(response) ??
            `document-${documentId}${guessPaperlessFileExtension(readPaperlessMimeType(response))}`,
          fallbackMimeType: "application/octet-stream",
          maximumBytes: paperlessMaxDownloadBytes,
        }),
    );
  },

  async get_document_thumbnail(context, input) {
    const documentId = encodePaperlessId(input.id, "id");
    requirePaperlessFileTransit(context);
    return context.requestRaw(
      {
        path: `/api/documents/${documentId}/thumb/`,
        query: { version: optionalInteger(input.version) },
        timeoutMs: paperlessFileTransferTimeoutMs,
      },
      (response) =>
        streamPaperlessResponseToTransit(context, {
          response,
          name: `document-${documentId}-thumbnail${guessPaperlessFileExtension(readPaperlessMimeType(response)) || ".webp"}`,
          fallbackMimeType: "image/webp",
          maximumBytes: paperlessMaxDownloadBytes,
        }),
    );
  },

  async list_document_notes(context, input) {
    return {
      notes: readNoteList(await context.request({ path: documentPath(input.id, "notes/") })),
    };
  },

  async add_document_note(context, input) {
    return {
      notes: readNoteList(
        await context.request({
          method: "POST",
          path: documentPath(input.id, "notes/"),
          body: { note: requirePaperlessInputString(input.note, "note") },
        }),
      ),
    };
  },

  async delete_document_note(context, input) {
    const noteId = encodePaperlessId(input.note_id, "note_id");
    const notes = readNoteList(
      await context.request({
        method: "DELETE",
        path: documentPath(input.id, "notes/"),
        query: { id: noteId },
      }),
    );
    return { ...deletedResult({ note_id: Number(noteId) }), notes };
  },

  async list_document_share_links(context, input) {
    return {
      share_links: paperlessResponseObjectArray(
        await context.request({ path: documentPath(input.id, "share_links/") }),
        "Paperless-ngx document share links response",
      ),
    };
  },

  async get_document_history(context, input) {
    return {
      entries: paperlessResponseObjectArray(
        await context.request({ path: documentPath(input.id, "history/") }),
        "Paperless-ngx document history response",
      ),
    };
  },

  async email_document(context, input) {
    const documentId = Number(encodePaperlessId(input.id, "id"));
    return sendDocumentEmail(context, buildEmailBody(input, [documentId]));
  },

  async email_documents(context, input) {
    const documents = looseArray(input.documents).map((id) => Number(encodePaperlessId(id, "documents")));
    if (documents.length === 0) {
      throw new ProviderRequestError(400, "documents must contain at least one id", undefined, "invalid_input");
    }
    return sendDocumentEmail(context, buildEmailBody(input, documents));
  },

  async update_document_version(context, input) {
    const documentId = encodePaperlessId(input.id, "id");
    const body = await buildDocumentFormData(context, input.file, input.fileName);
    appendFormText(body, "version_label", optionalString(input.version_label));
    return requestSubmittedTask(context, `/api/documents/${documentId}/update_version/`, body);
  },

  async delete_document_version(context, input) {
    const documentId = encodePaperlessId(input.id, "id");
    const versionId = encodePaperlessId(input.version_id, "version_id");
    return requiredResponseRecord(
      await context.request({
        method: "DELETE",
        path: `/api/documents/${documentId}/versions/${versionId}/`,
      }),
      "Paperless-ngx document version deletion response",
    );
  },

  async update_document_version_label(context, input) {
    const documentId = encodePaperlessId(input.id, "id");
    const versionId = encodePaperlessId(input.version_id, "version_id");
    const versionLabel = optionalString(input.version_label)?.trim() || null;
    return requiredResponseRecord(
      await context.request({
        method: "PATCH",
        path: `/api/documents/${documentId}/versions/${versionId}/`,
        body: { version_label: versionLabel },
      }),
      "Paperless-ngx document version label response",
    );
  },

  async get_next_asn(context) {
    return {
      next_asn: paperlessResponseInteger(
        await context.request({ path: "/api/documents/next_asn/" }),
        "Paperless-ngx next archive serial number response",
      ),
    };
  },

  async upload_document(context, input) {
    const body = await buildDocumentFormData(context, input.file, input.fileName);
    appendFormText(body, "title", optionalString(input.title));
    appendFormText(body, "created", optionalString(input.created));
    appendFormId(body, "correspondent", input.correspondent);
    appendFormId(body, "document_type", input.document_type);
    appendFormId(body, "storage_path", input.storage_path);
    for (const tag of looseArray(input.tags)) {
      body.append("tags", encodePaperlessId(tag, "tags"));
    }
    const archiveSerialNumber = optionalInteger(input.archive_serial_number);
    if (archiveSerialNumber !== undefined) {
      body.append("archive_serial_number", String(archiveSerialNumber));
    }
    const customFields = buildUploadCustomFields(input.custom_fields);
    if (customFields) {
      body.append("custom_fields", JSON.stringify(customFields));
    }
    return requestSubmittedTask(context, "/api/documents/post_document/", body);
  },
};
