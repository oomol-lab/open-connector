import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "encodian";

const fileContentField = s.nonEmptyString("The base64-encoded PDF document content to process.");
const fileNameField = s.nonEmptyString("The source PDF file name, including the .pdf extension required by Encodian.");
const optionalPositiveInteger = (description: string): JsonSchema => s.positiveInteger(description);
const nullableString = (description: string): JsonSchema => s.nullableString(description);
const pdfFileOutputSchema = s.object("Normalized Encodian file result with base64 output content.", {
  filename: s.nullableString("The output PDF file name returned by Encodian when available."),
  fileContent: s.nonEmptyString("The processed PDF document content returned by Encodian as a base64 string."),
  operationId: nullableString("The Encodian operation identifier returned for this request when available."),
  operationStatus: nullableString("The Encodian operation status returned for this request when available."),
  errors: s.stringArray("Any Encodian error messages echoed with the response.", {
    itemDescription: "One Encodian error message returned alongside the response.",
  }),
});
const pdfTextLayerOutputSchema = s.object("Normalized Encodian PDF text-layer extraction result.", {
  textLayer: s.string("The PDF text layer extracted by Encodian."),
  filename: s.nullableString("The PDF file name echoed by Encodian when available."),
  operationId: nullableString("The Encodian operation identifier returned for this request when available."),
  operationStatus: nullableString("The Encodian operation status returned for this request when available."),
  errors: s.stringArray("Any Encodian error messages echoed with the response.", {
    itemDescription: "One Encodian error message returned alongside the response.",
  }),
});
const extractPdfPagesInputSchema = s.object(
  "Input parameters for extracting selected pages from one PDF document.",
  {
    fileContent: fileContentField,
    startPage: optionalPositiveInteger("The first one-based page number to extract."),
    endPage: optionalPositiveInteger(
      "The last one-based page number to extract. Leave empty to continue to the final page.",
    ),
    pageNumbers: s.nonEmptyString("A comma-separated list of one-based page numbers to extract, such as '1,3,4'."),
  },
  { optional: ["startPage", "endPage", "pageNumbers"] },
);
const securePdfInputSchema = s.object(
  "Input parameters for securing one PDF document with passwords and privileges.",
  {
    fileName: fileNameField,
    fileContent: fileContentField,
    userPassword: s.nonEmptyString("Optional password required to open the protected PDF document."),
    adminPassword: s.nonEmptyString("Optional password required to edit the protected PDF document."),
    pdfPrivileges: s.stringEnum("The Encodian privilege mode applied to the protected PDF document.", [
      "AllowAll",
      "DenyAll",
      "Specific",
    ]),
    cryptoAlgorithm: s.stringEnum("The cryptographic algorithm Encodian should use for PDF encryption.", [
      "RC4x40",
      "RC4x128",
      "AESx128",
      "AESx256",
    ]),
    pdfPrivilegesAllowAssembly: s.boolean(
      "Whether document assembly should be permitted when privileges are Specific.",
    ),
    pdfPrivilegesAllowCopy: s.boolean("Whether content copying should be permitted when privileges are Specific."),
    pdfPrivilegesAllowFillIn: s.boolean("Whether form filling should be permitted when privileges are Specific."),
    pdfPrivilegesAllowPrint: s.boolean("Whether printing should be permitted when privileges are Specific."),
    pdfPrivilegesAllowScreenReaders: s.boolean(
      "Whether screen-reader extraction should be permitted when privileges are Specific.",
    ),
    pdfPrivilegesAllowModifyContents: s.boolean(
      "Whether content modification should be permitted when privileges are Specific.",
    ),
    pdfPrivilegesAllowModifyAnnotations: s.boolean(
      "Whether annotation modification should be permitted when privileges are Specific.",
    ),
  },
  {
    optional: [
      "userPassword",
      "adminPassword",
      "pdfPrivileges",
      "cryptoAlgorithm",
      "pdfPrivilegesAllowAssembly",
      "pdfPrivilegesAllowCopy",
      "pdfPrivilegesAllowFillIn",
      "pdfPrivilegesAllowPrint",
      "pdfPrivilegesAllowScreenReaders",
      "pdfPrivilegesAllowModifyContents",
      "pdfPrivilegesAllowModifyAnnotations",
    ],
  },
);

export const encodianActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "compress_pdf",
    description: "Compress one PDF document with Encodian and return the optimized PDF file as base64 content.",
    inputSchema: s.object(
      "Input parameters for compressing one PDF document.",
      {
        fileContent: fileContentField,
        compressImages: s.boolean("Whether Encodian should compress images embedded in the PDF document."),
        imageQuality: s.integer("The image quality percentage used when image compression is enabled.", {
          minimum: 1,
          maximum: 100,
        }),
        maxResolution: optionalPositiveInteger(
          "The maximum image resolution in DPI before Encodian scales oversized images down.",
        ),
        resizeImages: s.boolean("Whether Encodian should resize images larger than the maximum resolution."),
        removePrivateInfo: s.boolean("Whether Encodian should remove private PDF metadata from the document."),
        removeUnusedObjects: s.boolean("Whether Encodian should remove unused PDF objects from the document."),
        removeUnusedStreams: s.boolean("Whether Encodian should remove unused PDF resource streams."),
        linkDuplicateStreams: s.boolean("Whether Encodian should deduplicate identical PDF resource streams."),
        allowReusePageContent: s.boolean(
          "Whether Encodian should reuse identical page content while optimizing pages.",
        ),
        unembedFonts: s.boolean("Whether Encodian should remove embedded fonts from the document."),
        flattenAnnotations: s.boolean("Whether Encodian should flatten annotations into the PDF content."),
        deleteAnnotations: s.boolean("Whether Encodian should delete annotations from the PDF document."),
        flattenFields: s.boolean("Whether Encodian should flatten AcroForm fields into the PDF content."),
      },
      {
        optional: [
          "compressImages",
          "imageQuality",
          "maxResolution",
          "resizeImages",
          "removePrivateInfo",
          "removeUnusedObjects",
          "removeUnusedStreams",
          "linkDuplicateStreams",
          "allowReusePageContent",
          "unembedFonts",
          "flattenAnnotations",
          "deleteAnnotations",
          "flattenFields",
        ],
      },
    ),
    outputSchema: pdfFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "extract_pdf_pages",
    description: "Extract selected pages from one PDF document and return the resulting PDF file as base64 content.",
    inputSchema: extractPdfPagesInputSchema,
    outputSchema: pdfFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_pdf_text_layer",
    description: "Extract the text layer from one PDF document with optional page-range and encoding controls.",
    inputSchema: s.object(
      "Input parameters for extracting the text layer from one PDF document.",
      {
        fileName: fileNameField,
        fileContent: fileContentField,
        startPage: optionalPositiveInteger(
          "The first one-based page number to include when extracting the text layer.",
        ),
        endPage: optionalPositiveInteger("The last one-based page number to include when extracting the text layer."),
        textEncodingType: s.stringEnum("The text encoding Encodian should use for the extracted PDF text layer.", [
          "Default",
          "Latin1",
          "BigEndianUnicode",
          "UTF16",
          "UTF8",
          "UTF7",
          "ASCII",
        ]),
      },
      { optional: ["startPage", "endPage", "textEncodingType"] },
    ),
    outputSchema: pdfTextLayerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "secure_pdf_document",
    description:
      "Encrypt one PDF document with optional open and edit passwords, then return the protected PDF as base64 content.",
    inputSchema: securePdfInputSchema,
    outputSchema: pdfFileOutputSchema,
  }),
  defineProviderAction(service, {
    name: "unlock_pdf_document",
    description: "Remove password protection from one PDF document and return the unlocked PDF as base64 content.",
    inputSchema: s.object("Input parameters for unlocking one password-protected PDF document.", {
      fileName: fileNameField,
      fileContent: fileContentField,
      password: s.nonEmptyString("The password Encodian should use to unlock the PDF document."),
    }),
    outputSchema: pdfFileOutputSchema,
  }),
];
