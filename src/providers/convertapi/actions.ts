import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "convertapi";

const ocrLanguageValues = [
  "auto",
  "ar",
  "ca",
  "zh",
  "da",
  "nl",
  "en",
  "fi",
  "fr",
  "de",
  "el",
  "ko",
  "it",
  "ja",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sl",
  "es",
  "sv",
  "tr",
  "ua",
  "th",
];

const transitFileSchema = s.object("A copy of a converted file stored in local transit storage.", {
  fileId: s.nonEmptyString("The local transit file identifier."),
  downloadUrl: s.url("The local URL for downloading the transit file."),
  sizeBytes: s.number("The transit file size in bytes."),
  name: s.nonEmptyString("The transit file name."),
  mimeType: s.nonEmptyString("The transit file MIME type."),
});

const convertedFileSchema = s.object(
  "A converted file returned by ConvertAPI.",
  {
    fileName: s.string("The converted file name."),
    fileExt: s.string("The converted file extension."),
    fileSize: s.integer("The converted file size in bytes."),
    fileId: s.string("The ConvertAPI temporary file ID."),
    url: s.url("The ConvertAPI temporary download URL for the converted file."),
    transitFile: s.nullable(transitFileSchema),
  },
  { optional: ["fileName", "fileExt", "fileSize", "fileId", "url", "transitFile"] },
);

export type ConvertapiActionName = "convert_pdf_to_docx";

export const convertapiActions: Array<ProviderActionDefinition<ConvertapiActionName>> = [
  defineProviderAction(service, {
    name: "convert_pdf_to_docx",
    description:
      "Convert a publicly accessible PDF URL to DOCX with ConvertAPI and return temporary file download URLs.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for converting a public PDF URL to a DOCX file with ConvertAPI.",
      {
        fileUrl: s.url("The publicly accessible PDF URL to convert."),
        fileName: s.string({
          description:
            "The optional output file name to request from ConvertAPI. ConvertAPI appends the correct extension when needed.",
          maxLength: 200,
        }),
        timeout: s.integer({ description: "The conversion timeout in seconds.", minimum: 10, maximum: 1200 }),
        password: s.string("The password used to open a protected PDF document."),
        pageRange: s.string("The PDF page range to convert, for example 1-10 or 1,3,5."),
        layout: s.stringEnum("How ConvertAPI should reconstruct the PDF page layout in the DOCX output.", [
          "flowing",
          "continuous",
          "exact",
        ]),
        ocrMode: s.stringEnum("How ConvertAPI should apply OCR during conversion.", ["auto", "force", "never"]),
        ocrLanguage: s.stringEnum(
          "The OCR language code to use for text recognition, or auto for automatic detection.",
          ocrLanguageValues,
        ),
        ocrEngine: s.stringEnum("The OCR engine ConvertAPI should use for text recognition.", ["native", "tesseract"]),
        annotations: s.stringEnum("How ConvertAPI should handle PDF annotations in the DOCX output.", [
          "textBox",
          "comment",
          "none",
        ]),
      },
      {
        required: ["fileUrl"],
        optional: [
          "fileName",
          "timeout",
          "password",
          "pageRange",
          "layout",
          "ocrMode",
          "ocrLanguage",
          "ocrEngine",
          "annotations",
        ],
      },
    ),
    outputSchema: s.object(
      "The output payload for a ConvertAPI PDF to DOCX conversion.",
      {
        conversionCost: s.integer("The amount deducted from the ConvertAPI balance."),
        files: s.array("The converted DOCX files returned by ConvertAPI.", convertedFileSchema, { minItems: 1 }),
      },
      { optional: ["conversionCost"] },
    ),
  }),
];
