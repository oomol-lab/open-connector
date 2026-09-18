import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuDomainMediaProviderPermissions = {
  mediaUpload: "docs:document.media:upload",
  mediaDownload: "docs:document.media:download",
  documentRead: "docx:document:readonly",
  documentWrite: "docx:document:write_only",
  wikiRead: "wiki:node:read",
  slidesScreenshot: "slides:presentation:screenshot",
  taskAttachmentWrite: "task:attachment:write",
  okrImageUpload: "okr:okr.progress.file:upload",
  minutesMediaExport: "minutes:minutes.media:export",
  minutesUpload: "minutes:minutes.upload:write",
  driveFileUpload: "drive:file:upload",
  sheetWrite: "sheets:spreadsheet:write_only",
};
const token = s.string("A Feishu resource token.", { minLength: 1 });
const fileUrl = s.url("A public HTTP or HTTPS URL whose file bytes connector should fetch and upload.");
const fileName = s.string("The source or output file name.", { minLength: 1 });
const transitFile = s.object(
  "A file stored in local transit storage.",
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
const uploadedMedia = s.object(
  "The uploaded Feishu media.",
  {
    fileToken: token,
    fileName,
    sizeBytes: s.nonNegativeInteger("The uploaded file size in bytes."),
  },
  {
    optional: [],
  },
);
const docsMediaType = s.stringEnum("The document media block type.", ["image", "file"]);
const presentationReference = {
  presentationToken: s.string("The Slides presentation ID or Wiki node token.", {
    minLength: 1,
  }),
  presentationType: s.stringEnum("How to interpret the presentation token.", ["slides", "wiki"]),
};
const screenshotFile = s.object(
  "One decoded Slides screenshot stored in transit storage.",
  {
    slideId: s.string("The stable slide ID."),
    slideNumber: s.positiveInteger("The one-based slide number."),
    format: s.stringEnum("The screenshot image format.", ["png", "jpeg"]),
    name: s.string("The generated image name."),
    mimeType: s.string("The screenshot MIME type."),
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit file download URL."),
    sizeBytes: s.nonNegativeInteger("The decoded screenshot size in bytes."),
  },
  {
    optional: ["slideId", "slideNumber"],
  },
);
export function createFeishuDomainMediaActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "upload_docs_media",
      operationType: "write",
      description:
        "Upload an image or attachment from a public URL to a Feishu document block, using multipart upload above 20 MB.",
      requiredScopes: [feishuDomainMediaProviderPermissions.mediaUpload],
      providerPermissions: [feishuDomainMediaProviderPermissions.mediaUpload],
      inputSchema: s.object(
        "Provide the source file and document media routing target.",
        {
          fileUrl,
          fileName,
          parentType: s.stringEnum("The Feishu media upload parent type.", [
            "docx_image",
            "docx_file",
            "whiteboard",
            "mindnote_image",
          ]),
          parentNode: s.string("The target block, whiteboard, or mindnote token.", {
            minLength: 1,
          }),
          documentId: s.string("The document ID used as the Drive route token.", {
            minLength: 1,
          }),
        },
        {
          optional: ["fileName", "documentId"],
        },
      ),
      outputSchema: uploadedMedia,
    }),
    defineProviderAction(service, {
      name: "insert_docs_media",
      operationType: "write",
      description:
        "Append an image or file to a Feishu docx document by creating a block, uploading media, and binding the file token with rollback on failure.",
      requiredScopes: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.documentWrite,
        feishuDomainMediaProviderPermissions.mediaUpload,
      ],
      providerPermissions: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.documentWrite,
        feishuDomainMediaProviderPermissions.mediaUpload,
      ],
      inputSchema: s.object(
        "Identify the docx document and media to append.",
        {
          documentId: s.string("The docx document ID.", { minLength: 1 }),
          fileUrl,
          fileName,
          type: docsMediaType,
          align: s.stringEnum("The image alignment.", ["left", "center", "right"]),
          caption: s.string("The image caption text."),
          width: s.positiveInteger("The image display width in pixels.", { maximum: 10000 }),
          height: s.positiveInteger("The image display height in pixels.", { maximum: 10000 }),
          fileView: s.stringEnum("The file block rendering style.", ["card", "preview", "inline"]),
        },
        {
          optional: ["fileName", "align", "caption", "width", "height", "fileView"],
        },
      ),
      outputSchema: s.object(
        "The inserted document media block.",
        {
          documentId: token,
          blockId: token,
          fileToken: token,
          type: docsMediaType,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "preview_docs_media",
      operationType: "read",
      description: "Download the source-file preview of Feishu document media into local transit storage.",
      requiredScopes: [feishuDomainMediaProviderPermissions.mediaDownload],
      providerPermissions: [feishuDomainMediaProviderPermissions.mediaDownload],
      inputSchema: downloadTokenInput("Identify the document media token to preview."),
      outputSchema: transitFile,
    }),
    defineProviderAction(service, {
      name: "download_docs_media",
      operationType: "read",
      description: "Download Feishu document media or a whiteboard image into local transit storage.",
      requiredScopes: [feishuDomainMediaProviderPermissions.mediaDownload],
      providerPermissions: [feishuDomainMediaProviderPermissions.mediaDownload],
      inputSchema: s.object(
        "Identify the media resource to download.",
        {
          token,
          type: s.stringEnum("The resource download type.", ["media", "whiteboard"]),
          fileName,
        },
        {
          optional: ["type", "fileName"],
        },
      ),
      outputSchema: transitFile,
    }),
    defineProviderAction(service, {
      name: "download_document_cover",
      operationType: "read",
      description: "Read a Feishu docx document cover and download its image into local transit storage.",
      requiredScopes: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.mediaDownload,
      ],
      providerPermissions: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.mediaDownload,
      ],
      inputSchema: s.object(
        "Identify the document whose cover should be downloaded.",
        {
          documentId: token,
          fileName,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: s.object(
        "The downloaded document cover.",
        {
          documentId: token,
          cover: s.looseObject("The document cover metadata."),
          file: transitFile,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_document_cover",
      operationType: "write",
      description: "Upload an image from a public URL and set it as a Feishu docx document cover.",
      requiredScopes: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.documentWrite,
        feishuDomainMediaProviderPermissions.mediaUpload,
      ],
      providerPermissions: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.documentWrite,
        feishuDomainMediaProviderPermissions.mediaUpload,
      ],
      inputSchema: s.object(
        "Identify the document and source cover image.",
        {
          documentId: token,
          fileUrl,
          fileName,
          offsetRatioX: s.number("The horizontal cover offset ratio."),
          offsetRatioY: s.number("The vertical cover offset ratio."),
        },
        {
          optional: ["fileName", "offsetRatioX", "offsetRatioY"],
        },
      ),
      outputSchema: s.object(
        "The updated document cover.",
        {
          documentId: token,
          fileToken: token,
          cover: s.looseObject("The cover payload applied to the document."),
          updated: s.literal(true, { description: "Whether the cover was updated." }),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_document_cover",
      operationType: "destructive",
      description: "Idempotently clear the cover of a Feishu docx document.",
      requiredScopes: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.documentWrite,
      ],
      providerPermissions: [
        feishuDomainMediaProviderPermissions.documentRead,
        feishuDomainMediaProviderPermissions.documentWrite,
      ],
      inputSchema: s.object(
        "Identify the document whose cover should be cleared.",
        {
          documentId: token,
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The document cover deletion result.",
        {
          documentId: token,
          deleted: s.boolean("Whether an existing cover was cleared."),
          alreadyEmpty: s.boolean("Whether the document already had no cover."),
          previousCover: s.looseObject("The previous cover metadata."),
        },
        {
          optional: ["previousCover"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "upload_slides_media",
      operationType: "write",
      description: "Upload an image of at most 20 MB to a Slides presentation for use as an XML `<img>` file token.",
      requiredScopes: [feishuDomainMediaProviderPermissions.mediaUpload, feishuDomainMediaProviderPermissions.wikiRead],
      providerPermissions: [
        feishuDomainMediaProviderPermissions.mediaUpload,
        feishuDomainMediaProviderPermissions.wikiRead,
      ],
      inputSchema: s.object(
        "Identify the presentation and source image.",
        {
          ...presentationReference,
          fileUrl,
          fileName,
        },
        {
          optional: ["presentationType", "fileName"],
        },
      ),
      outputSchema: s.object(
        "The uploaded Slides media.",
        {
          presentationId: token,
          fileToken: token,
          fileName,
          sizeBytes: s.nonNegativeInteger("The uploaded image size in bytes."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "set_sheet_cell_image",
      operationType: "write",
      description: "Fetch an image from a public URL, upload it to a Feishu spreadsheet, and embed it into one cell.",
      requiredScopes: [
        feishuDomainMediaProviderPermissions.driveFileUpload,
        feishuDomainMediaProviderPermissions.sheetWrite,
      ],
      providerPermissions: [
        feishuDomainMediaProviderPermissions.driveFileUpload,
        feishuDomainMediaProviderPermissions.sheetWrite,
      ],
      inputSchema: s.object(
        "Identify one spreadsheet cell and provide the source image.",
        {
          spreadsheetToken: s.string("The Feishu spreadsheet token.", { minLength: 1 }),
          sheetId: s.string("The target sub-sheet ID.", { minLength: 1 }),
          sheetName: s.string("The target sub-sheet name.", { minLength: 1 }),
          range: s.string("A single-cell A1 range, such as `B3` or `B3:B3`.", {
            minLength: 1,
          }),
          imageUrl: fileUrl,
          fileName,
          allowOverwrite: s.boolean("Whether an existing cell value may be overwritten."),
        },
        {
          optional: ["sheetId", "sheetName", "fileName", "allowOverwrite"],
        },
      ),
      outputSchema: s.object(
        "The embedded spreadsheet image.",
        {
          spreadsheetToken: token,
          sheetId: s.string("The target sub-sheet ID."),
          sheetName: s.string("The target sub-sheet name."),
          range: s.string("The target single-cell range."),
          fileToken: token,
          fileName,
          width: s.positiveInteger("The source image width in pixels."),
          height: s.positiveInteger("The source image height in pixels."),
          result: s.looseObject("The decoded set_cell_range result."),
        },
        {
          optional: ["sheetId", "sheetName"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_slides_screenshots",
      operationType: "read",
      description: "Render up to ten existing Slides pages and store the decoded screenshots in local transit storage.",
      requiredScopes: [feishuDomainMediaProviderPermissions.slidesScreenshot],
      providerPermissions: [feishuDomainMediaProviderPermissions.slidesScreenshot],
      inputSchema: s.object(
        "Identify the presentation and select up to ten slides.",
        {
          presentationToken: token,
          slideIds: s.array("Stable slide IDs to render.", token, {
            minItems: 1,
            maxItems: 10,
          }),
          slideNumbers: s.array("One-based slide numbers to render.", s.positiveInteger("A one-based slide number."), {
            minItems: 1,
            maxItems: 10,
          }),
        },
        {
          optional: ["slideIds", "slideNumbers"],
        },
      ),
      outputSchema: s.object(
        "The rendered Slides screenshots.",
        {
          presentationId: token,
          screenshots: s.array("The decoded screenshots.", screenshotFile),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "render_slide_screenshot",
      operationType: "read",
      description: "Render one SML 2.0 slide XML fragment and store the decoded screenshot in local transit storage.",
      requiredScopes: [],
      providerPermissions: [],
      inputSchema: s.object(
        "Provide one complete SML slide XML element.",
        {
          content: s.string("The complete SML 2.0 `<slide>` XML content.", {
            minLength: 1,
          }),
          fileName,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: s.object(
        "The rendered slide screenshot.",
        {
          screenshot: screenshotFile,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "upload_task_attachment",
      operationType: "write",
      description: "Upload a file from a public URL as an attachment to a Feishu Task resource.",
      requiredScopes: [feishuDomainMediaProviderPermissions.taskAttachmentWrite],
      providerPermissions: [feishuDomainMediaProviderPermissions.taskAttachmentWrite],
      inputSchema: s.object(
        "Identify the Task resource and source file.",
        {
          resourceId: s.string("The Task GUID.", { minLength: 1 }),
          resourceType: s.string("The owning resource type; defaults to `task` and may be `task_delivery`.", {
            minLength: 1,
          }),
          userIdType: s.stringEnum("The user identifier type used by the API.", ["open_id", "union_id", "user_id"]),
          fileUrl,
          fileName,
        },
        {
          optional: ["resourceType", "userIdType", "fileName"],
        },
      ),
      outputSchema: s.object(
        "The uploaded Task attachment.",
        {
          attachment: s.looseObject("The attachment object returned by Feishu."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "upload_okr_image",
      operationType: "write",
      description: "Upload an image from a public URL for use in Feishu OKR progress rich text.",
      requiredScopes: [feishuDomainMediaProviderPermissions.okrImageUpload],
      providerPermissions: [feishuDomainMediaProviderPermissions.okrImageUpload],
      inputSchema: s.object(
        "Identify the OKR target and source image.",
        {
          targetId: s.string("The positive int64 objective or key-result ID.", {
            minLength: 1,
          }),
          targetType: s.stringEnum("The OKR progress target type.", ["objective", "key_result"]),
          fileUrl,
          fileName,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: s.object(
        "The uploaded OKR image.",
        {
          fileToken: token,
          url: s.url("The uploaded image URL returned by Feishu."),
          fileName,
          sizeBytes: s.nonNegativeInteger("The uploaded image size in bytes."),
        },
        {
          optional: ["url"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "download_minutes_media",
      operationType: "read",
      description: "Resolve and stream a Feishu Minutes audio or video recording into local transit storage.",
      requiredScopes: [feishuDomainMediaProviderPermissions.minutesMediaExport],
      providerPermissions: [feishuDomainMediaProviderPermissions.minutesMediaExport],
      inputSchema: s.object(
        "Identify the Minutes recording and optionally override its file name.",
        {
          minuteToken: token,
          fileName,
        },
        {
          optional: ["fileName"],
        },
      ),
      outputSchema: s.object(
        "The downloaded Minutes recording.",
        {
          minuteToken: token,
          file: transitFile,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "upload_minutes_media",
      operationType: "write",
      description:
        "Upload audio or video from a public URL to Drive and create a Feishu Minutes recording from the resulting file token.",
      requiredScopes: [
        feishuDomainMediaProviderPermissions.driveFileUpload,
        feishuDomainMediaProviderPermissions.minutesUpload,
      ],
      providerPermissions: [
        feishuDomainMediaProviderPermissions.driveFileUpload,
        feishuDomainMediaProviderPermissions.minutesUpload,
      ],
      inputSchema: s.object(
        "Provide a supported Minutes audio or video source.",
        {
          fileUrl,
          fileName,
          folderToken: s.string("The Drive folder used to stage the source file; omit it for Drive root.", {
            minLength: 1,
          }),
        },
        {
          optional: ["fileName", "folderToken"],
        },
      ),
      outputSchema: s.object(
        "The created Feishu Minutes recording.",
        {
          minuteToken: token,
          minuteUrl: s.url("The created Minutes URL."),
          fileToken: token,
          fileName,
          sizeBytes: s.nonNegativeInteger("The staged source file size in bytes."),
        },
        {
          optional: ["minuteToken"],
        },
      ),
    }),
  ];
}
function downloadTokenInput(description: string) {
  return s.object(
    description,
    {
      token,
      fileName,
    },
    {
      optional: ["fileName"],
    },
  );
}
