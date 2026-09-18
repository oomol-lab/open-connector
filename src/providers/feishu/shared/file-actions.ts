import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuFileProviderPermissions = {
  driveUpload: "drive:file:upload",
  driveDownload: "drive:file:download",
  driveMetadataRead: "drive:drive.metadata:readonly",
  messageRead: "im:message:readonly",
  documentExport: "docs:document:export",
  documentContentRead: "docs:document.content:read",
  documentMediaUpload: "docs:document.media:upload",
  documentMediaDownload: "docs:document.media:download",
  documentImport: "docs:document:import",
  baseFieldRead: "base:field:read",
  baseRecordRead: "base:record:read",
  baseRecordUpdate: "base:record:update",
};
const tokenSchema = s.string("A Feishu resource token.", { minLength: 1 });
const fileTokenSchema = s.string("A Feishu file token.", { minLength: 1 });
const sourceUrlSchema = s.url("A public HTTP or HTTPS URL whose file bytes connector should fetch and upload.");
const fileNameSchema = s.string("The file name including its extension.", { minLength: 1 });
const transitFileSchema = s.object(
  "A downloaded file stored in local transit storage.",
  {
    name: s.string("The downloaded file name."),
    mimeType: s.string("The downloaded file MIME type."),
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit file download URL."),
    sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
  },
  {
    optional: ["sizeBytes"],
  },
);
const driveUploadOutputSchema = s.object(
  "The uploaded Drive file.",
  {
    fileToken: fileTokenSchema,
    fileName: fileNameSchema,
    sizeBytes: s.nonNegativeInteger("The uploaded file size in bytes."),
    version: s.string("The uploaded file version returned by Feishu."),
  },
  {
    optional: ["version"],
  },
);
const exportDocumentTypeSchema = s.stringEnum("The Feishu source document type.", [
  "doc",
  "docx",
  "sheet",
  "bitable",
  "slides",
]);
const exportExtensionSchema = s.stringEnum("The requested export file format.", [
  "docx",
  "pdf",
  "xlsx",
  "csv",
  "base",
  "pptx",
]);
const importDocumentTypeSchema = s.stringEnum("The target Feishu document type.", [
  "docx",
  "sheet",
  "bitable",
  "slides",
]);
const importExtensionSchema = s.stringEnum("The source file extension without a leading dot.", [
  "docx",
  "doc",
  "txt",
  "md",
  "mark",
  "markdown",
  "html",
  "xlsx",
  "xls",
  "csv",
  "base",
  "pptx",
]);
const taskStatusSchema = s.stringEnum("The normalized asynchronous task status.", ["running", "succeeded", "failed"]);
const baseReferenceFields = {
  appToken: s.string("The Base app token.", { minLength: 1 }),
  tableId: s.string("The Base table ID.", { minLength: 1 }),
  recordId: s.string("The Base record ID.", { minLength: 1 }),
};
export function createFeishuFileActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "upload_drive_file",
      operationType: "write",
      description:
        "Upload a file from a public URL to Feishu Drive, automatically using the three-step multipart protocol above 20 MB.",
      requiredScopes: [feishuFileProviderPermissions.driveUpload, feishuFileProviderPermissions.driveMetadataRead],
      providerPermissions: [feishuFileProviderPermissions.driveUpload, feishuFileProviderPermissions.driveMetadataRead],
      inputSchema: s.object(
        "Provide the source file and one optional Drive destination.",
        {
          fileUrl: sourceUrlSchema,
          fileName: fileNameSchema,
          folderToken: s.string("The destination Drive folder token; omit both destination tokens for Drive root.", {
            minLength: 1,
          }),
          wikiToken: s.string("The destination Wiki node token.", { minLength: 1 }),
          existingFileToken: s.string("An existing Drive file token to overwrite in place.", {
            minLength: 1,
          }),
        },
        {
          optional: ["fileName", "folderToken", "wikiToken", "existingFileToken"],
        },
      ),
      outputSchema: driveUploadOutputSchema,
    }),
    defineProviderAction(service, {
      name: "download_drive_file",
      operationType: "read",
      description: "Download a Feishu Drive file into local transit storage.",
      requiredScopes: [feishuFileProviderPermissions.driveDownload],
      providerPermissions: [feishuFileProviderPermissions.driveDownload],
      inputSchema: s.object(
        "Identify the Drive file and optionally override its downloaded name.",
        {
          fileToken: fileTokenSchema,
          fileName: fileNameSchema,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: transitFileSchema,
    }),
    defineProviderAction(service, {
      name: "download_message_resource",
      operationType: "read",
      description: "Download one image or file resource attached to a Feishu message into local transit storage.",
      requiredScopes: [feishuFileProviderPermissions.messageRead],
      providerPermissions: [feishuFileProviderPermissions.messageRead],
      inputSchema: s.object(
        "Identify the message resource and optionally override its downloaded file name.",
        {
          messageId: s.string("The Feishu message ID containing the resource.", {
            minLength: 1,
          }),
          fileKey: s.string("The image_key or file_key exposed by the message content.", {
            minLength: 1,
          }),
          type: s.stringEnum("The message resource type.", ["image", "file"]),
          fileName: fileNameSchema,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: transitFileSchema,
    }),
    defineProviderAction(service, {
      name: "submit_drive_export",
      operationType: "write",
      description: "Submit an asynchronous Feishu Drive document export and return a handle for status polling.",
      requiredScopes: [feishuFileProviderPermissions.documentExport, feishuFileProviderPermissions.documentContentRead],
      providerPermissions: [
        feishuFileProviderPermissions.documentExport,
        feishuFileProviderPermissions.documentContentRead,
      ],
      asyncLifecycle: {
        startActionId: `${service}.submit_drive_export`,
        statusActionId: `${service}.get_drive_export`,
      },
      inputSchema: s.object(
        "Identify the source document and requested export format.",
        {
          token: tokenSchema,
          type: exportDocumentTypeSchema,
          fileExtension: exportExtensionSchema,
          subId: s.string("The sheet or Base table ID required for a CSV export.", {
            minLength: 1,
          }),
          onlySchema: s.boolean("Export only the Base schema when exporting a Base document as `base`."),
        },
        {
          optional: ["subId", "onlySchema"],
        },
      ),
      outputSchema: s.object(
        "The submitted Drive export task.",
        {
          ticket: s.string("The Feishu export task ticket."),
          sourceToken: tokenSchema,
          exportHandle: s.string("An opaque handle accepted by get_drive_export."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_drive_export",
      operationType: "read",
      description: "Get the normalized status and generated file token of a Drive export task.",
      requiredScopes: [feishuFileProviderPermissions.documentExport],
      providerPermissions: [feishuFileProviderPermissions.documentExport],
      inputSchema: s.object(
        "Provide the opaque export handle, or provide both the ticket and source token.",
        {
          exportHandle: s.string("The opaque handle returned by submit_drive_export.", {
            minLength: 1,
          }),
          ticket: s.string("The Feishu export task ticket.", { minLength: 1 }),
          sourceToken: tokenSchema,
        },
        {
          optional: ["exportHandle", "ticket", "sourceToken"],
        },
      ),
      outputSchema: s.object(
        "The normalized Drive export task status.",
        {
          ticket: s.string("The Feishu export task ticket."),
          status: taskStatusSchema,
          jobStatus: s.integer("The raw Feishu job status code."),
          fileToken: fileTokenSchema,
          fileName: s.string("The generated export file name."),
          fileExtension: s.string("The generated export file extension."),
          type: s.string("The source document type."),
          fileSize: s.nonNegativeInteger("The generated file size in bytes."),
          errorMessage: s.string("The Feishu export error message."),
          raw: s.looseObject("The raw Feishu export result."),
        },
        {
          optional: ["fileToken", "fileName", "fileExtension", "type", "fileSize", "errorMessage"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "download_drive_export",
      operationType: "read",
      description: "Download a generated Drive export file into local transit storage.",
      requiredScopes: [feishuFileProviderPermissions.documentExport],
      providerPermissions: [feishuFileProviderPermissions.documentExport],
      inputSchema: s.object(
        "Identify the generated export file and optionally override its name.",
        {
          fileToken: fileTokenSchema,
          fileName: fileNameSchema,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: transitFileSchema,
    }),
    defineProviderAction(service, {
      name: "submit_drive_import",
      operationType: "write",
      description:
        "Fetch a source file, upload it as Feishu import media, and submit an asynchronous Drive import task.",
      requiredScopes: [feishuFileProviderPermissions.documentMediaUpload, feishuFileProviderPermissions.documentImport],
      providerPermissions: [
        feishuFileProviderPermissions.documentMediaUpload,
        feishuFileProviderPermissions.documentImport,
      ],
      asyncLifecycle: {
        startActionId: `${service}.submit_drive_import`,
        statusActionId: `${service}.get_drive_import`,
      },
      inputSchema: s.object(
        "Provide the source file and target native Feishu document type.",
        {
          fileUrl: sourceUrlSchema,
          fileName: fileNameSchema,
          fileExtension: importExtensionSchema,
          type: importDocumentTypeSchema,
          folderToken: s.string("The target Drive folder token; omit it to import into Drive root.", { minLength: 1 }),
          name: s.string("The imported cloud document name without a required extension.", {
            minLength: 1,
          }),
          targetToken: s.string("An existing Base token to import data into; valid only when type is `bitable`.", {
            minLength: 1,
          }),
        },
        {
          optional: ["fileName", "fileExtension", "folderToken", "name", "targetToken"],
        },
      ),
      outputSchema: s.object(
        "The submitted Drive import task.",
        {
          ticket: s.string("The Feishu import task ticket."),
          uploadedFileToken: fileTokenSchema,
          fileName: fileNameSchema,
          fileExtension: importExtensionSchema,
          type: importDocumentTypeSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_drive_import",
      operationType: "read",
      description: "Get the normalized status and created document token of a Drive import task.",
      requiredScopes: [feishuFileProviderPermissions.documentImport],
      providerPermissions: [feishuFileProviderPermissions.documentImport],
      inputSchema: s.object(
        "Identify the Drive import task.",
        {
          ticket: s.string("The Feishu import task ticket.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The normalized Drive import task status.",
        {
          ticket: s.string("The Feishu import task ticket."),
          status: taskStatusSchema,
          jobStatus: s.integer("The raw Feishu job status code."),
          type: s.string("The created document type."),
          token: tokenSchema,
          url: s.url("The created document URL."),
          errorMessage: s.string("The Feishu import error message."),
          extra: s.unknown("Additional Feishu import result details."),
          raw: s.looseObject("The raw Feishu import result."),
        },
        {
          optional: ["type", "token", "url", "errorMessage", "extra"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "upload_base_attachments",
      operationType: "write",
      description:
        "Validate a Base attachment field, upload one or more files from public URLs, and append them to one record cell.",
      requiredScopes: [
        feishuFileProviderPermissions.baseFieldRead,
        feishuFileProviderPermissions.baseRecordUpdate,
        feishuFileProviderPermissions.documentMediaUpload,
      ],
      providerPermissions: [
        feishuFileProviderPermissions.baseFieldRead,
        feishuFileProviderPermissions.baseRecordUpdate,
        feishuFileProviderPermissions.documentMediaUpload,
      ],
      inputSchema: s.object(
        "Identify the Base cell and provide up to 50 source files.",
        {
          ...baseReferenceFields,
          fieldId: s.string("The attachment field ID or name.", { minLength: 1 }),
          files: s.array(
            "The files to upload and append.",
            s.object(
              "One attachment source.",
              {
                fileUrl: sourceUrlSchema,
                fileName: fileNameSchema,
              },
              {
                optional: ["fileName"],
              },
            ),
            { minItems: 1, maxItems: 50 },
          ),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The Base attachment append result.",
        {
          attachments: s.array(
            "The uploaded attachment metadata.",
            s.object(
              "One uploaded Base attachment.",
              {
                fileToken: fileTokenSchema,
                name: fileNameSchema,
                mimeType: s.string("The attachment MIME type."),
                sizeBytes: s.nonNegativeInteger("The attachment size in bytes."),
              },
              {
                optional: [],
              },
            ),
          ),
          raw: s.looseObject("The raw Base append response."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "download_base_attachments",
      operationType: "read",
      description:
        "Read Base attachment metadata and download selected or all record attachments into local transit storage.",
      requiredScopes: [
        feishuFileProviderPermissions.baseRecordRead,
        feishuFileProviderPermissions.documentMediaDownload,
      ],
      providerPermissions: [
        feishuFileProviderPermissions.baseRecordRead,
        feishuFileProviderPermissions.documentMediaDownload,
      ],
      inputSchema: s.object(
        "Identify the Base record and optionally select attachment file tokens.",
        {
          ...baseReferenceFields,
          fileTokens: s.array("The attachment file tokens to download.", fileTokenSchema, {
            minItems: 1,
            maxItems: 50,
          }),
        },
        {
          optional: ["fileTokens"],
        },
      ),
      outputSchema: s.object(
        "The downloaded Base attachments.",
        {
          files: s.array(
            "Files uploaded to local transit storage.",
            s.object(
              "One downloaded Base attachment.",
              {
                fieldId: s.string("The field containing the attachment."),
                fileToken: fileTokenSchema,
                name: s.string("The attachment file name."),
                mimeType: s.string("The downloaded MIME type."),
                fileId: s.nonEmptyString("The local transit file identifier."),
                downloadUrl: s.url("The local transit file download URL."),
                sizeBytes: s.nonNegativeInteger("The downloaded size in bytes."),
              },
              {
                optional: ["sizeBytes"],
              },
            ),
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "remove_base_attachments",
      operationType: "destructive",
      description: "Validate a Base attachment field and remove selected file tokens from one record cell.",
      requiredScopes: [feishuFileProviderPermissions.baseFieldRead, feishuFileProviderPermissions.baseRecordUpdate],
      providerPermissions: [
        feishuFileProviderPermissions.baseFieldRead,
        feishuFileProviderPermissions.baseRecordUpdate,
      ],
      inputSchema: s.object(
        "Identify the Base attachment cell and file tokens to remove.",
        {
          ...baseReferenceFields,
          fieldId: s.string("The attachment field ID or name.", { minLength: 1 }),
          fileTokens: s.array("The attachment file tokens to remove.", fileTokenSchema, {
            minItems: 1,
            maxItems: 50,
          }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The Base attachment removal result.",
        {
          removedFileTokens: s.array("The removed attachment file tokens.", fileTokenSchema),
          raw: s.looseObject("The raw Base remove response."),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
