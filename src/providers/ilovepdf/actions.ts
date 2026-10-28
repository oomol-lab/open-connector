import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const fileProperties = {
  fileUrl: s.url("The public URL of the source file, fetched by iLovePDF."),
  filename: s.nonEmptyString("The original filename, including its extension."),
  rotate: s.withEnum(s.integer("Rotation in degrees applied before processing. Defaults to 0."), [0, 90, 180, 270]),
  password: s.string("The password required to open this source file."),
};
const fileSchema = s.object("A source file downloaded by iLovePDF from a public URL.", fileProperties, {
  optional: ["rotate", "password"],
});
const metaSchema = s.object(
  "PDF metadata inserted or modified in the processed document.",
  {
    Title: s.string("The title of the document."),
    Author: s.string("The name of the person who created the document."),
    Subject: s.string("The subject of the document."),
    Keywords: s.string("Keywords associated with the document."),
    Creator: s.string("The application that created the original document."),
    Producer: s.string("The application that converted the document to PDF."),
    CreationDate: s.string("The document creation date and time in human-readable form."),
    ModDate: s.string("The last modification date and time in human-readable form."),
    Trapped: s.stringEnum("Whether the document contains trapping information.", ["true", "false", "unknown"]),
  },
  { required: [] },
);
const commonProperties = {
  files: s.array("Source files in processing order.", fileSchema, { minItems: 1 }),
  region: s.stringEnum("The jurisdiction where files are uploaded and processed. Omit to use iLovePDF's default.", [
    "eu",
    "us",
    "fr",
    "de",
    "pl",
    "in",
    "sg",
  ]),
  meta: metaSchema,
  ignoreErrors: s.boolean(
    "Continue when some files are damaged or fail; at least one file must succeed. Defaults to true.",
  ),
  ignorePassword: s.boolean(
    "Continue when some files require a password; at least one file must be processable. Defaults to false.",
  ),
  outputFilename: s.string("Output filename template. Supports {date}, {n}, {filename}, and {tool}."),
  packagedFilename: s.string(
    "ZIP filename template for multiple output files. Supports {date}, {n}, {filename}, and {tool}; defaults to output.",
  ),
  fileEncryptionKey: {
    ...s.string("The 16, 24, or 32 character key used to encrypt files at rest on iLovePDF throughout this task."),
    anyOf: [
      { minLength: 16, maxLength: 16 },
      { minLength: 24, maxLength: 24 },
      { minLength: 32, maxLength: 32 },
    ],
  },
  tryPdfRepair: s.boolean("Attempt to repair PDF files that fail processing. Defaults to true."),
  tryImageRepair: s.boolean("Attempt to repair image files that fail processing. Defaults to true."),
  customInt: s.integer("An integer associated with the task for later filtering."),
  customString: s.string("A custom string associated with the task."),
};
const outputSchema = s.requiredObject("The processed file in transit storage and the upstream task result.", {
  file: s.requiredObject("A processed file, or a ZIP archive when processing produces multiple files.", {
    name: s.string("The downloaded artifact filename."),
    mimeType: s.string("The downloaded artifact MIME type."),
    fileId: s.nonEmptyString("The transit file identifier."),
    downloadUrl: s.url("The transit URL for downloading the processed artifact."),
    sizeBytes: s.nonNegativeInteger("The downloaded artifact size in bytes."),
  }),
  task: s.nonEmptyString("The iLovePDF task identifier."),
  server: s.nonEmptyString("The iLovePDF server assigned to the task."),
  result: s.looseObject("The upstream processing result, including available warnings and processing statistics.", {}),
});
function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  actionOutputSchema: JsonSchema = outputSchema,
): ActionDefinition {
  return defineProviderAction("ilovepdf", {
    name,
    description,
    operationType: "read",
    requiredScopes: [],
    inputSchema,
    outputSchema: actionOutputSchema,
  });
}
function input(description: string, properties: Record<string, JsonSchema> = {}) {
  return s.object(description, { ...commonProperties, ...properties }, { required: ["files"] });
}
const splitSchema = input("Files and options for splitting PDFs into ranges or removing pages.", {
  splitMode: s.stringEnum(
    "Split mode. Defaults to ranges; filesize uses the provider's size-based splitting behavior.",
    ["ranges", "fixed_range", "remove_pages", "filesize"],
  ),
  ranges: s.nonEmptyString("Page ranges to save as separate PDFs, for example 1,5,10-14. Required for ranges mode."),
  fixedRange: s.positiveInteger("The number of pages per output PDF. Required for fixed_range mode."),
  removePages: s.nonEmptyString("Pages to remove, for example 1,4,8-12,16. Required for remove_pages mode."),
  mergeAfter: s.boolean("Merge the selected ranges into one PDF. Applies to ranges mode and defaults to false."),
});
splitSchema.allOf = [
  { if: { properties: { splitMode: { const: "ranges" } } }, then: { required: ["ranges"] } },
  {
    if: { properties: { splitMode: { const: "fixed_range" } }, required: ["splitMode"] },
    then: { required: ["fixedRange"] },
  },
  {
    if: { properties: { splitMode: { const: "remove_pages" } }, required: ["splitMode"] },
    then: { required: ["removePages"] },
  },
];
const ocrLanguages = [
  "eng",
  "afr",
  "amh",
  "ara",
  "asm",
  "aze",
  "aze_cyrl",
  "bel",
  "ben",
  "bod",
  "bos",
  "bre",
  "bul",
  "cat",
  "ceb",
  "ces",
  "chi_sim",
  "chi_tra",
  "chr",
  "cos",
  "cym",
  "dan",
  "deu",
  "deu_latf",
  "dzo",
  "ell",
  "enm",
  "epo",
  "equ",
  "est",
  "eus",
  "fao",
  "fas",
  "fil",
  "fin",
  "fra",
  "frm",
  "fry",
  "gla",
  "gle",
  "glg",
  "grc",
  "guj",
  "hat",
  "heb",
  "hin",
  "hrv",
  "hun",
  "hye",
  "iku",
  "ind",
  "isl",
  "ita",
  "ita_old",
  "jav",
  "jpn",
  "kan",
  "kat",
  "kat_old",
  "kaz",
  "khm",
  "kir",
  "kmr",
  "kor",
  "kor_vert",
  "lao",
  "lat",
  "lav",
  "lit",
  "ltz",
  "mal",
  "mar",
  "mkd",
  "mlt",
  "mon",
  "mri",
  "msa",
  "mya",
  "nep",
  "nld",
  "nor",
  "oci",
  "ori",
  "pan",
  "pol",
  "por",
  "pus",
  "que",
  "ron",
  "rus",
  "san",
  "sin",
  "slk",
  "slv",
  "snd",
  "spa",
  "spa_old",
  "sqi",
  "srp",
  "srp_latn",
  "sun",
  "swa",
  "swe",
  "syr",
  "tam",
  "tat",
  "tel",
  "tgk",
  "tgl",
  "tha",
  "tir",
  "ton",
  "tur",
  "uig",
  "ukr",
  "urd",
  "uzb",
  "uzb_cyrl",
  "vie",
  "yid",
  "yor",
];
const pdfaProperties = {
  conformance: s.stringEnum("The requested PDF/A conformance level. Defaults to pdfa-2b.", [
    "pdfa-1b",
    "pdfa-1a",
    "pdfa-2b",
    "pdfa-2u",
    "pdfa-2a",
    "pdfa-3b",
    "pdfa-3u",
    "pdfa-3a",
  ]),
  allowDowngrade: s.boolean("Allow a lower conformance level if conversion fails. Defaults to true."),
};
const validationOutputSchema = s.requiredObject("PDF/A validation results without a downloaded artifact.", {
  task: s.nonEmptyString("The iLovePDF task identifier."),
  server: s.nonEmptyString("The iLovePDF server assigned to the task."),
  validations: s.array(
    "The PDF/A validation results returned for the uploaded files.",
    s.looseObject("An upstream per-file PDF/A validation result.", {
      server_filename: s.string("The uploaded filename assigned by iLovePDF."),
      status: s.string("The upstream PDF/A validation status."),
    }),
  ),
  result: s.looseObject("The upstream processing result, including available warnings and processing statistics.", {}),
});
const ilovepdfActions: readonly ActionDefinition[] = [
  action(
    "merge_pdf",
    "Merge PDF files from public URLs in the supplied order and return a downloadable PDF.",
    input("PDF files to merge in the supplied order.", {
      files: s.array("PDF files to merge in the supplied order.", fileSchema, { minItems: 2 }),
    }),
  ),
  action(
    "split_pdf",
    "Split PDFs by page ranges, fixed page counts, or file size, or remove selected pages, and return the resulting file or ZIP.",
    splitSchema,
  ),
  action(
    "compress_pdf",
    "Compress PDF files from public URLs and return the processed PDF or ZIP.",
    input("PDF files and compression options.", {
      compressionLevel: s.stringEnum("Compression strength. Defaults to recommended.", [
        "extreme",
        "recommended",
        "low",
      ]),
    }),
  ),
  action(
    "rotate_pdf",
    "Rotate each PDF by its per-file rotate value and return the processed PDF or ZIP.",
    input("PDF files with a rotation angle for each file.", {
      files: s.array(
        "PDF files and their required rotation angles.",
        s.object(
          "A source PDF and the rotation to apply.",
          {
            ...fileProperties,
            rotate: s.withEnum(s.integer("Rotation in degrees applied to this PDF."), [0, 90, 180, 270]),
          },
          { required: ["fileUrl", "filename", "rotate"] },
        ),
        { minItems: 1 },
      ),
    }),
  ),
  action(
    "office_to_pdf",
    "Convert Office documents from public URLs to PDF and return the resulting PDF or ZIP.",
    input("Office documents to convert to PDF."),
  ),
  action(
    "image_to_pdf",
    "Convert images from public URLs to PDF with page layout and merge options, returning the resulting PDF or ZIP.",
    input("Images and page layout options for PDF conversion.", {
      orientation: s.stringEnum("PDF page orientation. Defaults to portrait.", ["portrait", "landscape"]),
      margin: s.nonNegativeInteger("Image margin in pixels in the output PDF. Defaults to 0."),
      pageSize: s.stringEnum("PDF page size; fit matches the source image size. Defaults to fit.", [
        "fit",
        "A4",
        "letter",
      ]),
      mergeAfter: s.boolean("Combine all converted images into one PDF. Defaults to true."),
    }),
  ),
  action(
    "pdf_to_image",
    "Convert PDF pages to JPG images or extract embedded images, returning the resulting image or ZIP.",
    input("PDF files and image conversion options.", {
      pdfjpgMode: s.stringEnum("Convert all pages to JPG images, or extract embedded images. Defaults to pages.", [
        "pages",
        "extract",
      ]),
    }),
  ),
  action(
    "ocr_pdf",
    "Recognize text in scanned PDFs using the selected OCR languages and return searchable PDFs or a ZIP.",
    input("Scanned PDF files and OCR language options.", {
      ocrLanguages: s.array(
        "OCR languages to apply. Defaults to English (eng).",
        s.stringEnum("An iLovePDF OCR language code.", ocrLanguages),
        { minItems: 1 },
      ),
    }),
  ),
  action(
    "extract_text",
    "Extract text from PDFs and return text files or a ZIP, optionally including page, position, and font details.",
    input("PDF files and text extraction options.", {
      detailed: s.boolean(
        "Include comma-separated PageNo, XPos, YPos, Width, FontName, FontSize, Length, and Text properties.",
      ),
    }),
  ),
  action(
    "protect_pdf",
    "Encrypt PDF files with an output password and return the protected PDF or ZIP.",
    s.object(
      "PDF files and the password required to open their protected output.",
      { ...commonProperties, outputPassword: s.nonEmptyString("The password used to encrypt the output PDFs.") },
      { required: ["files", "outputPassword"] },
    ),
  ),
  action(
    "unlock_pdf",
    "Remove password protection from PDFs and return the unlocked PDF or ZIP. Supply each source file's opening password when needed.",
    input("PDF files to unlock, with opening passwords when needed."),
  ),
  action(
    "repair_pdf",
    "Attempt to recover damaged PDF files and return the repaired PDF or ZIP.",
    input("Damaged PDF files to repair."),
  ),
  action(
    "add_page_numbers",
    "Add page numbers to PDFs with page selection, placement, and font options, returning the numbered PDF or ZIP.",
    input("PDF files and page numbering options.", {
      facingPages: s.boolean("Position page numbers symmetrically on facing pages. Defaults to false."),
      firstCover: s.boolean("Treat the first page as a cover and leave it unnumbered. Defaults to false."),
      pages: s.nonEmptyString("Pages to number, such as all, 3-end, 1,3,4-9, -2-end, or 3-234. Defaults to all."),
      startingNumber: s.integer("The first page number to use. Defaults to 1."),
      verticalPosition: s.stringEnum("Vertical position of page numbers. Defaults to bottom.", ["bottom", "top"]),
      horizontalPosition: s.stringEnum(
        "Horizontal position of page numbers; facing pages use symmetric positions. Defaults to center.",
        ["left", "center", "right"],
      ),
      verticalPositionAdjustment: s.integer(
        "Vertical offset from the standard position in pixels; positive and negative values are accepted.",
      ),
      horizontalPositionAdjustment: s.integer(
        "Horizontal offset from the standard position in pixels; positive and negative values are accepted.",
      ),
      fontFamily: s.stringEnum("Page number font family. Defaults to Arial Unicode MS.", [
        "Arial",
        "Arial Unicode MS",
        "Verdana",
        "Courier",
        "Times New Roman",
        "Comic Sans MS",
        "WenQuanYi Zen Hei",
        "Lohit Marathi",
      ]),
      fontSize: s.integer("Page number font size. Defaults to 14."),
      fontColor: s.string("Hexadecimal page number color. Defaults to #000000."),
      text: s.nullableString(
        "Page number template using {n} for the current number and {p} for the total pages; null displays only the number. Defaults to {n}.",
      ),
    }),
  ),
  action(
    "convert_to_pdfa",
    "Convert PDFs to the requested PDF/A conformance level for archiving and return the PDF or ZIP.",
    input("PDF files and PDF/A conversion options.", pdfaProperties),
  ),
  action(
    "validate_pdfa",
    "Validate PDFs against the requested PDF/A conformance level and return per-file validation results without downloading a file.",
    input("PDF files and PDF/A validation options.", pdfaProperties),
    validationOutputSchema,
  ),
];
export default ilovepdfActions;
