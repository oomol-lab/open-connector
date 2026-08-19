import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fuxin";

const uploadableFileSchema: JsonSchema = {
  ...s.object(
    "A file source provided as a public URL or Base64 payload.",
    {
      name: s.string("Optional file name to use when uploading a multipart source to Foxit."),
      mimetype: s.string("Optional MIME type to use when uploading a multipart source to Foxit."),
      url: s.url("A public URL that the runtime can download before uploading to Foxit."),
      contentBase64: s.string("The Base64-encoded file content uploaded to Foxit as multipart."),
    },
    { optional: ["name", "mimetype", "url", "contentBase64"] },
  ),
  anyOf: [{ required: ["url"] }, { required: ["contentBase64"] }],
  not: { required: ["url", "contentBase64"] },
};

const documentSourceProperties = {
  docId: s.string("An existing Foxit document ID returned by upload_file or a previous task."),
  file: uploadableFileSchema,
};

function withDocumentSource(
  properties: Record<string, JsonSchema>,
  required: string[],
  description: string,
): JsonSchema {
  return {
    ...s.object(description, { ...documentSourceProperties, ...properties }, { required }),
    anyOf: [{ required: ["docId"] }, { required: ["file"] }],
  };
}

const checkParamsSchema = s.nullable(
  s.array("The upstream parameter validation issues returned by Foxit, if any.", s.unknown("One upstream issue item.")),
);

const taskSubmissionSchema = s.actionOutput(
  {
    taskId: s.string("The Foxit task identifier."),
    checkParams: checkParamsSchema,
  },
  "The normalized task submission response returned by Foxit.",
);

const uploadFileOutputSchema = s.actionOutput(
  {
    fileName: s.string("The uploaded file name returned by Foxit."),
    docId: s.string("The uploaded Foxit document ID."),
    fileSize: s.integer("The uploaded file size in bytes."),
  },
  "The normalized Foxit upload result.",
);

const downloadableFileSchema = s.object("A downloadable file uploaded to local transit storage.", {
  name: s.string("The downloaded file name."),
  mimetype: s.string("The MIME type of the downloaded file."),
  downloadUrl: s.url("The local transit URL for downloading the file."),
});

const taskPageInfoSchema = s.object("One page metadata item returned by Foxit.", {
  pageIndex: s.integer("The 1-based page index."),
  rotation: s.nullableInteger("The page rotation where 0=0deg, 1=90deg, 2=180deg, and 3=270deg."),
  width: s.nullableNumber("The page width in 1/72 inch units."),
  height: s.nullableNumber("The page height in 1/72 inch units."),
});

const taskStatusSchema = s.actionOutput(
  {
    docId: s.nullableString("The result document ID when the task has completed."),
    percentage: s.nullableInteger("The reported task completion percentage."),
    isRunning: s.boolean("Whether Foxit reports the task as still running."),
    detail: s.nullableString("The upstream detail message returned by Foxit, if any."),
    pagesIsScannedResult: s.nullable(
      s.record(
        "The per-page scanned-page result returned by pages_is_scanned tasks.",
        s.boolean("Whether the page is scanned."),
      ),
    ),
    pagesInfo: s.nullable(s.array("The page metadata returned by pages_basic_info tasks.", taskPageInfoSchema)),
  },
  "The normalized Foxit task status response.",
);

const stockSchema = s.object("One Foxit stock summary.", {
  totalNum: s.nullableInteger("The total quota."),
  usedNum: s.nullableInteger("The used quota."),
  remainNum: s.nullableInteger("The remaining quota."),
  expireTime: s.nullableInteger("The Unix timestamp in seconds when the quota expires."),
  type: s.nullableInteger("The Foxit stock type where 1=paid and 0=trial."),
});

const userStockSchema = s.actionOutput(
  {
    serviceApiStock: s.nullable(stockSchema),
    embedApiStock: s.nullable(stockSchema),
  },
  "The normalized Foxit stock response.",
);

const createPdfFromDocumentInputSchema = withDocumentSource(
  {
    inputFormat: s.stringEnum("The source document format that Foxit should convert into PDF.", [
      "word",
      "excel",
      "ppt",
      "image",
      "text",
    ]),
  },
  ["inputFormat"],
  "The input payload for creating a PDF from another document format.",
);

const createPdfFromHtmlConfigSchema = s.object(
  "The HTML-to-PDF conversion options accepted by Foxit.",
  {
    width: s.integer("The output page width, greater than 16."),
    height: s.integer("The output page height, greater than 16."),
    rotate: s.integer("The page rotation where 0=0deg, 1=90deg, 2=180deg, and 3=270deg."),
    pageMode: s.integer("The page mode where 0=single page and 1=multi-page."),
    pageScaling: s.integer("The page scaling mode where 0=none, 1=fixed size, and 2=fit HTML content."),
  },
  { optional: ["width", "height", "rotate", "pageMode", "pageScaling"] },
);

const createPdfFromHtmlInputSchema = s.oneOf(
  [
    s.object(
      "The input payload for converting one webpage URL into a PDF.",
      {
        format: s.literal("url", { description: "Use a webpage URL as the HTML source." }),
        url: s.url("The webpage URL to convert."),
        config: createPdfFromHtmlConfigSchema,
      },
      { required: ["format", "url"], optional: ["config"] },
    ),
    withDocumentSource(
      {
        format: s.stringEnum("The HTML document format that Foxit should read from the source file.", [
          "html",
          "htm",
          "shtml",
        ]),
        config: createPdfFromHtmlConfigSchema,
      },
      ["format"],
      "The input payload for converting one HTML document source into a PDF.",
    ),
  ],
  { description: "The input payload for creating a PDF from HTML content or a webpage URL." },
);

const convertImageConfigSchema = s.object(
  "The image conversion options accepted by Foxit.",
  {
    dpi: s.integer("The output image DPI between 1 and 1000 when outputFormat is image.", {
      minimum: 1,
      maximum: 1000,
    }),
    pageRange: s.string("The page range when outputFormat is image, such as 1,3,5, 1-89, all, even, or odd."),
  },
  { optional: ["dpi", "pageRange"] },
);

const convertDocumentInputSchema = withDocumentSource(
  {
    outputFormat: s.stringEnum("The target format that Foxit should convert the PDF into.", [
      "word",
      "excel",
      "ppt",
      "image",
      "text",
    ]),
    imageConfig: convertImageConfigSchema,
  },
  ["outputFormat"],
  "The input payload for converting a PDF into another format.",
);

const compareDocumentInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for comparing two PDF files.",
    {
      baseDocId: s.string("The Foxit document ID for the baseline PDF when baseFile is omitted."),
      baseFile: uploadableFileSchema,
      compareDocId: s.string("The Foxit document ID for the comparison PDF when compareFile is omitted."),
      compareFile: uploadableFileSchema,
      resultType: s.stringEnum("Whether Foxit should return a JSON diff or a rendered PDF diff.", ["json", "pdf"]),
      compareType: s.stringEnum("Whether Foxit should compare all changes or only text changes.", ["all", "text"]),
    },
    { optional: ["baseDocId", "baseFile", "compareDocId", "compareFile", "resultType", "compareType"] },
  ),
  allOf: [
    { anyOf: [{ required: ["baseDocId"] }, { required: ["baseFile"] }] },
    { anyOf: [{ required: ["compareDocId"] }, { required: ["compareFile"] }] },
  ],
};

const protectPasswordSchema = s.object(
  "The password settings used when protecting a PDF.",
  {
    userPassword: s.string("The PDF user password."),
    ownerPassword: s.string("The PDF owner password."),
  },
  { optional: ["userPassword", "ownerPassword"] },
);

const protectDocumentInputSchema = withDocumentSource(
  {
    passwordProtection: protectPasswordSchema,
    permission: s.array(
      "The Foxit permission flags to keep on the protected PDF.",
      s.stringEnum("One Foxit permission flag.", [
        "PRINT_LOW_QUALITY",
        "PRINT_HIGH_QUALITY",
        "EDIT_CONTENT",
        "EDIT_FILL_AND_SIGN_FORM_FIELDS",
        "EDIT_ANNOTATION",
        "EDIT_DOCUMENT_ASSEMBLY",
        "COPY_CONTENT",
      ]),
    ),
    encryptionAlgorithm: s.stringEnum("The Foxit encryption algorithm used to protect the PDF.", [
      "AES_128",
      "AES_256",
      "RC4",
    ]),
  },
  ["passwordProtection", "encryptionAlgorithm"],
  "The input payload for protecting a PDF with passwords and permissions.",
);

const pageRangeField = s.string("The optional page range, such as 1-30, 1,3,5, or all.");

const manipulationConfigItemSchema: JsonSchema = {
  ...s.object(
    "One Foxit page manipulation operation.",
    {
      pageAction: s.stringEnum("The page operation type.", ["delete", "rotate", "move"]),
      pages: s.array("The zero-based page indexes affected by the operation.", s.integer("One zero-based page index.")),
      angle: s.integer("The rotation angle where 0=0deg, 1=90deg, 2=180deg, and 3=270deg."),
      destination: s.integer("The target zero-based page index used by move operations."),
    },
    { required: ["pageAction", "pages"], optional: ["angle", "destination"] },
  ),
  allOf: [
    {
      if: { properties: { pageAction: { const: "rotate" } }, required: ["pageAction"] },
      then: { required: ["angle"] },
    },
    {
      if: { properties: { pageAction: { const: "move" } }, required: ["pageAction"] },
      then: { required: ["destination"] },
    },
  ],
};

const manipulateDocumentPagesInputSchema = withDocumentSource(
  {
    config: s.array("The ordered list of page manipulation operations.", manipulationConfigItemSchema),
  },
  ["config"],
  "The input payload for deleting, rotating, or moving PDF pages.",
);

const mergeDocumentsConfigSchema = s.object(
  "The merge options accepted by Foxit.",
  {
    isAddBookmark: s.boolean("Whether Foxit should add bookmarks."),
    isAddTOC: s.boolean("Whether Foxit should add a table of contents. Foxit requires isAddBookmark to stay true."),
    isContinueMerge: s.boolean("Whether Foxit should continue merging when one source document fails."),
    isRetainPageNum: s.boolean("Whether Foxit should retain logical page numbers."),
    bookmarkLevels: s.string("The bookmark level range used to generate a table of contents, such as 1 or 1-5."),
  },
  { optional: ["isAddBookmark", "isAddTOC", "isContinueMerge", "isRetainPageNum", "bookmarkLevels"] },
);

const mergeDocumentsInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for merging multiple PDF files.",
    {
      docIds: s.stringArray("The document IDs to merge in order.", {
        minItems: 1,
        itemDescription: "One Foxit document ID to merge.",
      }),
      zipFile: uploadableFileSchema,
      config: mergeDocumentsConfigSchema,
    },
    { optional: ["docIds", "zipFile", "config"] },
  ),
  anyOf: [{ required: ["docIds"] }, { required: ["zipFile"] }],
};

const splitDocumentInputSchema = withDocumentSource(
  {
    pageCount: s.positiveInteger("The number of pages that each split file should contain."),
  },
  ["pageCount"],
  "The input payload for splitting a PDF into smaller files.",
);

const compressDocumentInputSchema = withDocumentSource(
  {
    compressionLevel: s.stringEnum("The Foxit compression level to apply.", ["high", "medium", "low"]),
  },
  ["compressionLevel"],
  "The input payload for compressing a PDF.",
);

const removePasswordDocumentInputSchema = withDocumentSource(
  {
    password: s.string("The password used to open the protected document before Foxit removes it."),
  },
  ["password"],
  "The input payload for removing a PDF password.",
);

const linearizeDocumentInputSchema = withDocumentSource({}, [], "The input payload for linearizing a PDF.");

const flattenDocumentInputSchema = withDocumentSource(
  {
    pageRange: pageRangeField,
  },
  [],
  "The input payload for flattening annotations and form fields in a PDF.",
);

const pageInfoDocumentInputSchema = withDocumentSource(
  {
    pageRange: pageRangeField,
  },
  [],
  "The input payload for requesting per-page PDF analysis in Foxit.",
);

const extractDocumentInputSchema = withDocumentSource(
  {
    mode: s.stringEnum("Whether Foxit should extract text or embedded images.", ["extractText", "extractImages"]),
    pageRange: pageRangeField,
  },
  ["mode"],
  "The input payload for extracting text or images from a PDF.",
);

const ocrDocumentInputSchema = withDocumentSource(
  {
    lang: s.stringEnum("The OCR language used by Foxit.", ["eng", "zho", "zhs", "zht", "spa", "fra", "deu", "jpn"]),
    outputFormat: s.stringEnum("The OCR output format returned by Foxit.", ["text", "json"]),
  },
  [],
  "The input payload for running OCR on a PDF or image document.",
);

const officeToImageInputSchema = withDocumentSource(
  {
    format: s.stringEnum("The input Office document format that Foxit should convert to images.", [
      "word",
      "excel",
      "ppt",
    ]),
    dpi: s.integer("The output image DPI between 1 and 1000.", { minimum: 1, maximum: 1000 }),
    destImgSuffix: s.stringEnum("The image file suffix Foxit should generate for each page.", [
      ".bmp",
      ".jpg",
      ".jpeg",
      ".png",
      ".tif",
      ".tiff",
      ".jpx",
      ".jp2",
    ]),
  },
  ["format"],
  "The input payload for converting an Office document into page images.",
);

const watermarkFontSchema = s.object(
  "The text watermark font configuration.",
  {
    text: s.string("The watermark text content."),
    size: s.integer("The watermark font size."),
    fontName: s.string("The watermark font name."),
    color: s.string("The watermark color such as #000000."),
    style: s.integer("The watermark font style where 0=normal and 1=underline."),
    alignment: s.integer("The text alignment where 0=left, 1=center, and 2=right."),
    lineSpace: s.number("The line spacing value between 0 and 10."),
  },
  { required: ["text"], optional: ["size", "fontName", "color", "style", "alignment", "lineSpace"] },
);

const watermarkDocumentInputSchema: JsonSchema = {
  ...withDocumentSource(
    {
      imageDocId: s.string("An existing Foxit document ID for the watermark image when type is imageObject."),
      imageFile: uploadableFileSchema,
      pageRange: pageRangeField,
      type: s.stringEnum("Whether Foxit should use a text watermark or an image watermark.", [
        "textObject",
        "imageObject",
      ]),
      position: s.integer("The watermark anchor position between 0 and 8."),
      offsetX: s.number("The horizontal watermark offset in points."),
      offsetY: s.number("The vertical watermark offset in points."),
      flagOnTopOfPage: s.integer("Whether the watermark stays above page content where 1=true and 0=false."),
      flagNoPrint: s.integer("Whether the watermark is excluded from printing where 1=true and 0=false."),
      flagInvisible: s.integer("Whether the watermark is invisible where 1=true and 0=false."),
      scaleX: s.number("The horizontal watermark scale factor."),
      scaleY: s.number("The vertical watermark scale factor."),
      rotation: s.number("The watermark rotation angle."),
      opacity: s.integer("The watermark opacity between 0 and 100.", { minimum: 0, maximum: 100 }),
      font: watermarkFontSchema,
    },
    [],
    "The input payload for adding a watermark to a PDF.",
  ),
  allOf: [
    {
      if: { properties: { type: { const: "imageObject" } }, required: ["type"] },
      then: { anyOf: [{ required: ["imageDocId"] }, { required: ["imageFile"] }] },
    },
    {
      if: { properties: { type: { const: "textObject" } }, required: ["type"] },
      then: { required: ["font"] },
    },
  ],
};

export const fuxinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "upload_file",
    description: "Upload one source file to Foxit Cloud API and return the reusable Foxit document ID.",
    inputSchema: s.requiredObject("The input payload for uploading one file to Foxit.", {
      file: uploadableFileSchema,
    }),
    outputSchema: uploadFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Fetch one Foxit task status and return the normalized task progress details.",
    inputSchema: s.requiredObject("The input payload for querying one Foxit task.", {
      taskId: s.string("The Foxit task ID to query."),
    }),
    outputSchema: taskStatusSchema,
  }),
  defineProviderAction(service, {
    name: "download_file",
    description: "Download one Foxit result document and upload it to local transit storage.",
    inputSchema: s.object(
      "The input payload for downloading one Foxit result file.",
      {
        docId: s.string("The Foxit document ID to download."),
        fileName: s.string("Optional output file name passed through to Foxit download."),
      },
      { required: ["docId"], optional: ["fileName"] },
    ),
    outputSchema: s.actionOutput(
      {
        file: downloadableFileSchema,
        contentLength: s.integer("The downloaded file size in bytes."),
      },
      "The normalized Foxit download response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user_stock",
    description: "Fetch the remaining Foxit Services API and Embed API quota for the connected credential.",
    inputSchema: s.object({}, { description: "No input is required for this action." }),
    outputSchema: userStockSchema,
  }),
  defineProviderAction(service, {
    name: "create_pdf_from_document",
    description: "Create a PDF from a Word, Excel, PowerPoint, image, or text source in Foxit.",
    inputSchema: createPdfFromDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "create_pdf_from_html",
    description: "Create a PDF from HTML content, an HTML file, or a webpage URL in Foxit.",
    inputSchema: createPdfFromHtmlInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "convert_document",
    description: "Convert one PDF into Word, Excel, PowerPoint, image, or text with Foxit.",
    inputSchema: convertDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "compare_documents",
    description: "Compare two PDF documents with Foxit and submit a diff task.",
    inputSchema: compareDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "protect_document",
    description: "Protect one PDF with passwords and permissions in Foxit.",
    inputSchema: protectDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "manipulate_document_pages",
    description: "Delete, rotate, or move PDF pages with Foxit.",
    inputSchema: manipulateDocumentPagesInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "merge_documents",
    description: "Merge multiple PDF documents into a single PDF with Foxit.",
    inputSchema: mergeDocumentsInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "split_document",
    description: "Split one PDF into multiple smaller files with Foxit.",
    inputSchema: splitDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "compress_document",
    description: "Compress one PDF with a chosen Foxit compression level.",
    inputSchema: compressDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "remove_password_from_document",
    description: "Remove the password from one protected PDF with Foxit.",
    inputSchema: removePasswordDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "linearize_document",
    description: "Linearize one PDF to improve incremental web viewing in Foxit.",
    inputSchema: linearizeDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "flatten_document",
    description: "Flatten annotations and form fields into the page content of one PDF with Foxit.",
    inputSchema: flattenDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "extract_document",
    description: "Extract text or embedded images from one PDF with Foxit.",
    inputSchema: extractDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "get_pages_basic_info",
    description: "Submit one PDF for page-size and rotation analysis in Foxit.",
    inputSchema: pageInfoDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "check_pages_are_scanned",
    description: "Submit one PDF for scanned-page detection in Foxit.",
    inputSchema: pageInfoDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "ocr_document",
    description: "Run OCR on one PDF or image document with Foxit.",
    inputSchema: ocrDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "convert_office_document_to_images",
    description: "Convert one Office document into a ZIP of page images with Foxit.",
    inputSchema: officeToImageInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
  defineProviderAction(service, {
    name: "watermark_document",
    description: "Add a text or image watermark to one PDF with Foxit.",
    inputSchema: watermarkDocumentInputSchema,
    outputSchema: taskSubmissionSchema,
  }),
];
