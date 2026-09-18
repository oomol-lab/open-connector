import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mineru";

const modelVersionSchema = s.stringEnum("The MinerU model version to use for parsing.", [
  "pipeline",
  "vlm",
  "MinerU-HTML",
]);
const extraFormatSchema = s.stringEnum("An additional export format requested for the parsed result.", [
  "docx",
  "html",
  "latex",
]);
const languageSchema = s.stringEnum("The document language pack used by pipeline and vlm models.", [
  "ch",
  "ch_server",
  "en",
  "japan",
  "korean",
  "chinese_cht",
  "ta",
  "te",
  "ka",
  "el",
  "th",
  "latin",
  "arabic",
  "cyrillic",
  "east_slavic",
  "devanagari",
]);
const dataIdSchema = s.string({
  minLength: 1,
  maxLength: 128,
  description: "The caller-defined data identifier associated with the source document.",
});
const extractProgressSchema = s.object("The upstream parsing progress details returned while the task is running.", {
  extracted_pages: s.integer("The number of pages that have already been parsed."),
  total_pages: s.integer("The total number of pages reported for the document."),
  start_time: s.string("The upstream parsing start time."),
});
const extractTaskResultSchema = s.object(
  "The normalized MinerU extraction task result.",
  {
    task_id: s.string("The MinerU extraction task identifier."),
    data_id: s.string("The caller-defined data identifier, when provided."),
    state: s.string("The upstream task state, such as pending, running, converting, done, or failed."),
    full_zip_url: s.string("The ZIP URL containing Markdown, JSON, and any requested exports."),
    err_msg: s.string("The upstream failure reason when the task failed."),
    extract_progress: extractProgressSchema,
  },
  { optional: ["data_id", "full_zip_url", "err_msg", "extract_progress"] },
);
const batchExtractResultSchema = s.object(
  "The normalized MinerU batch extraction item result.",
  {
    file_name: s.string("The submitted source file name, when returned."),
    data_id: s.string("The caller-defined data identifier, when provided."),
    state: s.string("The upstream task state, such as waiting-file, pending, running, converting, done, or failed."),
    full_zip_url: s.string("The ZIP URL containing Markdown, JSON, and any requested exports."),
    err_msg: s.string("The upstream failure reason when the task failed."),
    extract_progress: extractProgressSchema,
  },
  { optional: ["file_name", "data_id", "full_zip_url", "err_msg", "extract_progress"] },
);

const commonSingleExtractInputProperties: Record<string, JsonSchema> = {
  url: s.url("The public HTTP or HTTPS URL of the document to parse with MinerU."),
  is_ocr: s.boolean("Whether to enable OCR. Only applies to pipeline and vlm models."),
  enable_formula: s.boolean("Whether to enable formula recognition for pipeline and vlm models."),
  enable_table: s.boolean("Whether to enable table recognition for pipeline and vlm models."),
  language: languageSchema,
  data_id: dataIdSchema,
  extra_formats: s.array("Additional result formats to export besides Markdown and JSON.", extraFormatSchema, {
    minItems: 1,
  }),
  page_ranges: s.nonEmptyString("The page range expression to parse, such as 2,4-6 or 2--2."),
  model_version: modelVersionSchema,
  no_cache: s.boolean("Whether MinerU should bypass its URL content cache."),
  cache_tolerance: s.nonNegativeInteger("The acceptable MinerU URL cache age in seconds when no_cache is false."),
};

const batchFileInputSchema = s.object(
  "One URL-based MinerU batch extraction file descriptor.",
  {
    url: s.url("The public HTTP or HTTPS URL of one document to parse with MinerU."),
    is_ocr: s.boolean("Whether to enable OCR for this file. Only applies to pipeline and vlm models."),
    data_id: dataIdSchema,
    page_ranges: s.nonEmptyString("The page range expression to parse for this file."),
  },
  { required: ["url"], optional: ["is_ocr", "data_id", "page_ranges"] },
);

export const mineruActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_extract_task",
    operationType: "write",
    description: "Create a MinerU precise extraction task from a document URL.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for creating a MinerU extraction task from a document URL.",
      {
        ...commonSingleExtractInputProperties,
      },
      {
        required: ["url"],
        optional: [
          "is_ocr",
          "enable_formula",
          "enable_table",
          "language",
          "data_id",
          "extra_formats",
          "page_ranges",
          "model_version",
          "no_cache",
          "cache_tolerance",
        ],
      },
    ),
    outputSchema: s.object(
      "The normalized output payload for creating a MinerU extraction task.",
      {
        task_id: s.string("The MinerU extraction task identifier."),
        trace_id: s.string("The upstream request trace identifier."),
        msg: s.string("The upstream response message."),
      },
      { optional: ["trace_id", "msg"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_extract_task",
    operationType: "read",
    description: "Get the current status and result URLs for a MinerU extraction task.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input payload for looking up a MinerU extraction task.", {
      task_id: s.nonEmptyString("The MinerU extraction task identifier."),
    }),
    outputSchema: extractTaskResultSchema,
  }),
  defineProviderAction(service, {
    name: "create_extract_batch",
    operationType: "write",
    description: "Create a MinerU precise extraction batch from document URLs.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input payload for creating a MinerU URL batch extraction task.",
      {
        files: s.array("The URL-based documents to submit for batch parsing.", batchFileInputSchema, {
          minItems: 1,
          maxItems: 50,
        }),
        enable_formula: s.boolean("Whether to enable formula recognition for pipeline and vlm models."),
        enable_table: s.boolean("Whether to enable table recognition for pipeline and vlm models."),
        language: languageSchema,
        extra_formats: s.array("Additional result formats to export besides Markdown and JSON.", extraFormatSchema, {
          minItems: 1,
        }),
        model_version: modelVersionSchema,
        no_cache: s.boolean("Whether MinerU should bypass its URL content cache."),
        cache_tolerance: s.nonNegativeInteger("The acceptable MinerU URL cache age in seconds when no_cache is false."),
      },
      {
        required: ["files"],
        optional: [
          "enable_formula",
          "enable_table",
          "language",
          "extra_formats",
          "model_version",
          "no_cache",
          "cache_tolerance",
        ],
      },
    ),
    outputSchema: s.object(
      "The normalized output payload for creating a MinerU extraction batch.",
      {
        batch_id: s.string("The MinerU batch extraction task identifier."),
        trace_id: s.string("The upstream request trace identifier."),
        msg: s.string("The upstream response message."),
      },
      { optional: ["trace_id", "msg"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_extract_batch_results",
    operationType: "read",
    description: "Get the current status and result URLs for a MinerU extraction batch.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Input payload for looking up MinerU batch extraction results.", {
      batch_id: s.nonEmptyString("The MinerU batch extraction task identifier."),
    }),
    outputSchema: s.object(
      "The normalized output payload for MinerU batch extraction results.",
      {
        batch_id: s.string("The MinerU batch extraction task identifier."),
        extract_result: s.array("The extraction results for files in the requested batch.", batchExtractResultSchema),
        trace_id: s.string("The upstream request trace identifier."),
        msg: s.string("The upstream response message."),
      },
      { optional: ["trace_id", "msg"] },
    ),
  }),
];
