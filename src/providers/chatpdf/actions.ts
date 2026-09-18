import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chatpdf";

const messageSchema = s.actionOutput(
  {
    role: s.stringEnum("The author role for this message.", ["user", "assistant"]),
    content: s.nonEmptyString("The message text sent to ChatPDF."),
  },
  "One message in the stateless ChatPDF conversation.",
);

const referenceSchema = s.looseRequiredObject("One PDF page referenced by ChatPDF.", {
  pageNumber: s.positiveInteger("The one-based PDF page number used in the answer."),
});

export const chatpdfActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "add_source_url",
    operationType: "write",
    description: "Import a publicly reachable PDF URL into ChatPDF and return its source ID.",
    inputSchema: s.actionInput(
      {
        url: s.url("The publicly reachable URL of the PDF to import."),
      },
      ["url"],
      "The PDF URL to import into ChatPDF.",
    ),
    outputSchema: s.actionOutput(
      {
        sourceId: s.nonEmptyString("The source ID assigned to the imported PDF."),
      },
      "The ChatPDF source created from the URL.",
    ),
  }),
  defineProviderAction(service, {
    name: "chat",
    operationType: "read",
    description: "Ask ChatPDF one or more stateless questions about an imported PDF source.",
    inputSchema: s.actionInput(
      {
        sourceId: s.nonEmptyString("The ChatPDF source ID for the imported PDF."),
        messages: s.array("The stateless conversation sent to ChatPDF.", messageSchema, {
          minItems: 1,
          maxItems: 6,
        }),
        referenceSources: s.boolean("Whether ChatPDF should include inline page citations and reference metadata."),
      },
      ["sourceId", "messages"],
      "The source and conversation messages to send to ChatPDF.",
    ),
    outputSchema: s.actionOutput(
      {
        content: s.string("The answer text generated from the PDF."),
        references: s.array("The PDF pages cited in the answer.", referenceSchema),
      },
      "The answer returned by ChatPDF.",
      ["content"],
    ),
  }),
  defineProviderAction(service, {
    name: "delete_sources",
    operationType: "destructive",
    description: "Delete one or more imported PDF sources from ChatPDF.",
    inputSchema: s.actionInput(
      {
        sources: s.array("The source IDs to delete.", s.nonEmptyString("A ChatPDF source ID."), {
          minItems: 1,
        }),
      },
      ["sources"],
      "The ChatPDF source IDs to delete.",
    ),
    outputSchema: s.actionOutput(
      {
        deletedSources: s.array(
          "The source IDs accepted for deletion.",
          s.nonEmptyString("A deleted ChatPDF source ID."),
        ),
      },
      "The source IDs accepted for deletion by ChatPDF.",
    ),
  }),
];
