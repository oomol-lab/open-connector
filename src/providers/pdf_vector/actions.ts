import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pdf_vector";
const modelInputSchema = s.stringEnum(
  "The PDF Vector model tier. Defaults to auto, which lets PDF Vector select a tier.",
  ["auto", "nano", "mini", "pro", "max"],
);
const modelOutputSchema = s.stringEnum("The model tier used by PDF Vector.", ["nano", "mini", "pro", "max"]);
const documentIdSchema = s.nonEmptyString("An optional external document identifier recorded with PDF Vector usage.", {
  maxLength: 512,
});
const resultMetadata = {
  pageCount: s.integer("The number of pages processed by PDF Vector."),
  model: modelOutputSchema,
  credits: s.integer("The number of PDF Vector credits consumed by the request."),
  requestId: s.integer("The PDF Vector request identifier."),
  documentId: s.optional(s.string("The external document identifier when one was supplied.")),
};
const documentInput = {
  documentUrl: s.url("The publicly accessible HTTP or HTTPS URL of the document that PDF Vector should process."),
  model: s.optional(modelInputSchema),
  documentId: s.optional(documentIdSchema),
};
const pageSchema = s.looseRequiredObject("The extracted content for one document page.", {
  pageNumber: s.integer("The 1-based page number in the source document.", { minimum: 1 }),
  markdown: s.string("The Markdown content extracted from this page."),
});

export const pdfVectorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "parse_document",
    operationType: "read",
    description: "Parse a document from a public URL into Markdown with PDF Vector.",
    inputSchema: s.object(
      {
        ...documentInput,
        includePages: s.optional(
          s.boolean("Whether to include page-separated Markdown in addition to the full document text."),
        ),
      },
      { description: "A public document URL and PDF Vector parsing options." },
    ),
    outputSchema: s.looseObject("The document content and usage metadata returned by PDF Vector.", {
      markdown: s.string("The full Markdown content extracted from the document."),
      ...resultMetadata,
      html: s.optional(s.string("The rich HTML representation returned when supported by the model.")),
      pages: s.optional(s.array("Page-separated Markdown when includePages is enabled.", pageSchema)),
    }),
  }),
  defineProviderAction(service, {
    name: "ask_document",
    operationType: "read",
    description: "Ask a question about a document available at a public URL with PDF Vector.",
    inputSchema: s.object(
      {
        ...documentInput,
        question: s.string("The question PDF Vector should answer from the document.", { minLength: 4 }),
      },
      { description: "A public document URL, question, and PDF Vector model options." },
    ),
    outputSchema: s.looseObject("The answer and usage metadata returned by PDF Vector.", {
      markdown: s.string("The Markdown answer to the question."),
      ...resultMetadata,
    }),
  }),
  defineProviderAction(service, {
    name: "extract_document",
    operationType: "read",
    description: "Extract structured JSON matching a supplied schema from a document at a public URL with PDF Vector.",
    inputSchema: s.object(
      {
        ...documentInput,
        prompt: s.string("Instructions describing the data to extract from the document.", { minLength: 4 }),
        schema: s.looseObject("The JSON Schema describing the structure PDF Vector should extract."),
      },
      { description: "A public document URL, extraction prompt, JSON Schema, and PDF Vector model options." },
    ),
    outputSchema: s.looseObject("The extracted JSON value and usage metadata returned by PDF Vector.", {
      data: s.optional(s.unknown("The structured data produced from the caller-supplied JSON Schema.")),
      ...resultMetadata,
    }),
  }),
];
