import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "parseur";

const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const rawObject = s.looseObject("Raw object returned by Parseur.");
const status = s.stringEnum("Parseur document processing status.", [
  "INCOMING",
  "ANALYZING",
  "PROGRESS",
  "PARSEDOK",
  "PARSEDKO",
  "QUOTAEXC",
  "SKIPPED",
  "SPLIT",
  "EXPORTKO",
  "TRANSKO",
  "INVALID",
]);
const pageInput = {
  page: positiveInteger("Page number for Parseur pagination."),
  page_size: positiveInteger("Number of results per page returned by Parseur."),
  search: s.nonEmptyString("Case-insensitive partial match search string."),
};
const pageMeta = s.object("Pagination metadata returned by Parseur.", {
  count: s.integer("Total number of results across all pages."),
  current: s.integer("Current page number returned by Parseur."),
  total: s.integer("Total number of pages returned by Parseur."),
});
const statusCounts = s.looseObject("Document counts grouped by Parseur processing status.");
const mailboxSummary = s.object("A Parseur mailbox summary.", {
  id: s.integer("Parseur mailbox identifier."),
  name: s.string("Parseur mailbox display name."),
  email_prefix: s.string("Email prefix assigned to the mailbox."),
  document_count: s.integer("Number of documents in the mailbox."),
  template_count: s.integer("Number of templates in the mailbox."),
  last_activity: s.nullable(s.dateTime("Last activity timestamp for the mailbox.")),
  document_per_status_count: statusCounts,
  raw: rawObject,
});
const mailbox = s.object("Detailed Parseur mailbox metadata.", {
  id: s.integer("Parseur mailbox identifier."),
  name: s.string("Parseur mailbox display name."),
  email_prefix: s.string("Email prefix assigned to the mailbox."),
  document_count: s.integer("Number of documents in the mailbox."),
  template_count: s.integer("Number of templates in the mailbox."),
  webhook_count: s.integer("Number of webhooks attached to the mailbox."),
  last_activity: s.nullable(s.dateTime("Last activity timestamp for the mailbox.")),
  default_timezone: s.nullable(s.string("Default timezone configured for the mailbox.")),
  csv_download: s.nullable(s.string("Relative CSV download path returned by Parseur.")),
  json_download: s.nullable(s.string("Relative JSON download path returned by Parseur.")),
  xls_download: s.nullable(s.string("Relative XLS download path returned by Parseur.")),
  document_per_status_count: statusCounts,
  raw: rawObject,
});
const documentSummary = s.object("A Parseur document summary.", {
  id: s.integer("Parseur document identifier."),
  name: s.string("Document name returned by Parseur."),
  parser: s.integer("Parseur mailbox identifier that owns the document."),
  status,
  status_source: s.nullable(s.string("Source that produced the document status.")),
  received: s.nullable(s.dateTime("Timestamp when Parseur received the document.")),
  processed: s.nullable(s.dateTime("Timestamp when Parseur processed the document.")),
  original_document_url: s.nullable(s.url("URL for the original document.")),
  json_download_url: s.nullable(s.url("URL for the parsed JSON result.")),
  csv_download_url: s.nullable(s.url("URL for the parsed CSV result.")),
  xls_download_url: s.nullable(s.url("URL for the parsed XLS result.")),
  raw: rawObject,
});
const document = s.object("Detailed Parseur document metadata and parsed data.", {
  ...(documentSummary.properties as Record<string, never>),
  result: s.nullable(s.unknown("Parsed result returned by Parseur.")),
  content: s.nullable(s.string("Text content returned by Parseur when available.")),
  next_id: s.nullable(s.integer("Next document identifier when available.")),
  prev_id: s.nullable(s.integer("Previous document identifier when available.")),
});

export const parseurActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_mailboxes",
    description: "List Parseur mailboxes with pagination, search, and ordering filters.",
    inputSchema: s.object(
      "Input parameters for listing Parseur mailboxes.",
      {
        ...pageInput,
        ordering: s.string("Field used to order Parseur mailboxes."),
      },
      { optional: ["page", "page_size", "search", "ordering"] },
    ),
    outputSchema: s.object("Paginated Parseur mailbox results.", {
      meta: pageMeta,
      mailboxes: s.array("Mailboxes returned by Parseur.", mailboxSummary),
    }),
  }),
  defineProviderAction(service, {
    name: "get_mailbox",
    description: "Retrieve detailed metadata for a Parseur mailbox.",
    inputSchema: s.object("Input parameters for retrieving a Parseur mailbox.", {
      id: positiveInteger("Parseur mailbox identifier."),
    }),
    outputSchema: s.object("Parseur mailbox details.", { mailbox }),
  }),
  defineProviderAction(service, {
    name: "get_mailbox_schema",
    description: "Retrieve the parsed result JSON Schema for a Parseur mailbox.",
    inputSchema: s.object("Input parameters for retrieving a Parseur mailbox schema.", {
      id: positiveInteger("Parseur mailbox identifier."),
    }),
    outputSchema: s.object("Parseur mailbox JSON Schema response.", {
      schema: s.looseObject("JSON Schema returned by Parseur for the mailbox fields."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_mailbox_documents",
    description: "List documents in a Parseur mailbox with pagination and filters.",
    inputSchema: s.object(
      "Input parameters for listing documents in a Parseur mailbox.",
      {
        id: positiveInteger("Parseur mailbox identifier."),
        ...pageInput,
        ordering: s.string("Field used to order Parseur documents."),
        received_after: s.date("Only include documents received after this date."),
        received_before: s.date("Only include documents received before this date."),
        status,
        tz: s.nonEmptyString("Timezone used by Parseur for date filters."),
        with_result: s.boolean("Whether Parseur should include parsed result strings."),
      },
      {
        optional: [
          "page",
          "page_size",
          "search",
          "ordering",
          "received_after",
          "received_before",
          "status",
          "tz",
          "with_result",
        ],
      },
    ),
    outputSchema: s.object("Paginated Parseur document results.", {
      meta: pageMeta,
      documents: s.array("Documents returned by Parseur.", documentSummary),
    }),
  }),
  defineProviderAction(service, {
    name: "get_document",
    description: "Retrieve detailed metadata and parsed result for one Parseur document.",
    inputSchema: s.object("Input parameters for retrieving a Parseur document.", {
      id: positiveInteger("Parseur document identifier."),
    }),
    outputSchema: s.object("Parseur document details.", { document }),
  }),
];
