import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "reducto";

const documentUrlSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description:
    "A public URL, presigned URL, reducto:// file identifier, or jobid:// parse job identifier accepted by Reducto.",
});
const looseConfigSchema = s.looseObject(
  "Reducto configuration object forwarded to the official API using Reducto option names.",
);
const jsonSchemaObject = s.looseObject("JSON Schema object that tells Reducto which fields to extract.");
const splitDescriptionSchema = s.object(
  {
    name: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The section or partition name Reducto should identify.",
    }),
    description: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "Natural-language criteria that describe this section.",
    }),
    partition_key: s.nullable(
      s.string({ minLength: 1, description: "Optional Reducto partition key used for partition-aware splitting." }),
    ),
  },
  { optional: ["partition_key"], description: "A Reducto split category description." },
);

const usageSchema = s.looseRequiredObject("Usage counters returned by Reducto.", {
  num_pages: s.integer("The number of document pages processed by Reducto."),
});
const normalizedResponseSchema = s.object(
  {
    jobId: s.nullableString("The Reducto job identifier when returned."),
    duration: s.nullableNumber("The Reducto processing duration in seconds when returned."),
    pdfUrl: s.nullableString("The temporary processed PDF URL when returned."),
    studioLink: s.nullableString("The Reducto Studio result URL when returned."),
    usage: s.nullable(usageSchema),
    result: s.unknown("The Reducto result payload."),
    raw: s.looseObject("The raw Reducto response payload."),
  },
  { description: "A normalized Reducto response with stable convenience fields and the raw upstream payload." },
);
const splitOutputSchema = s.object(
  {
    sectionMapping: s.nullable(
      s.record(
        "The page numbers mapped by Reducto for each section name.",
        s.array("One-indexed Reducto page numbers for the section.", s.integer("A page number.")),
      ),
    ),
    splits: s.array(
      "The split records returned by Reducto.",
      s.looseRequiredObject("A Reducto split record.", {
        name: s.string("The split section name."),
        pages: s.array("One-indexed Reducto page numbers for the split.", s.integer("A page number.")),
      }),
    ),
    usage: s.nullable(usageSchema),
    result: s.unknown("The raw Reducto result object."),
    raw: s.looseObject("The raw Reducto split response payload."),
  },
  { description: "A normalized Reducto split response with section mapping, splits, and the raw upstream payload." },
);

export const reductoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "parse_document",
    operationType: "read",
    description:
      "Parse a Reducto-supported document URL or file id into structured chunks, blocks, and document metadata.",
    inputSchema: s.object(
      {
        documentUrl: documentUrlSchema,
        enhance: looseConfigSchema,
        retrieval: looseConfigSchema,
        formatting: looseConfigSchema,
        spreadsheet: looseConfigSchema,
        settings: looseConfigSchema,
      },
      {
        optional: ["enhance", "retrieval", "formatting", "spreadsheet", "settings"],
        description: "Input for parsing a document with Reducto.",
      },
    ),
    outputSchema: normalizedResponseSchema,
  }),
  defineProviderAction(service, {
    name: "extract_data",
    operationType: "read",
    description:
      "Extract structured JSON from a Reducto-supported document URL or file id using a caller-supplied JSON Schema.",
    inputSchema: s.object(
      {
        documentUrl: documentUrlSchema,
        schema: jsonSchemaObject,
        systemPrompt: s.string({
          minLength: 1,
          pattern: "\\S",
          description: "Optional system prompt used by Reducto extraction.",
        }),
        parsing: looseConfigSchema,
        settings: looseConfigSchema,
      },
      {
        optional: ["systemPrompt", "parsing", "settings"],
        description: "Input for extracting structured data from a document with Reducto.",
      },
    ),
    outputSchema: normalizedResponseSchema,
  }),
  defineProviderAction(service, {
    name: "split_document",
    operationType: "read",
    description:
      "Split a Reducto-supported document URL or file id into named page sections using natural-language section descriptions.",
    inputSchema: s.object(
      {
        documentUrl: documentUrlSchema,
        splitDescription: s.array(
          "The Reducto section descriptions to identify in the document.",
          splitDescriptionSchema,
          { minItems: 1 },
        ),
        splitRules: s.string({
          minLength: 1,
          pattern: "\\S",
          description: "Optional prompt that defines global rules for splitting.",
        }),
        parsing: looseConfigSchema,
        settings: looseConfigSchema,
      },
      {
        optional: ["splitRules", "parsing", "settings"],
        description: "Input for splitting a document into named sections with Reducto.",
      },
    ),
    outputSchema: splitOutputSchema,
  }),
];
