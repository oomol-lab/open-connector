import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "better_proposals";

const pageField = s.integer("Page number to retrieve.", { minimum: 1 });
const perPageField = s.integer("Number of records to return per page.", { minimum: 1 });
const idField = s.nonEmptyString("The Better Proposals resource identifier.");
const documentTypeIdField = s.nonEmptyString("Filter proposals by Better Proposals document type ID.");
const rawObjectSchema = s.looseObject("Raw object returned by the Better Proposals API.");

const noInputSchema = (description: string): JsonSchema => s.object({}, { description });
const pagedInputSchema = s.object(
  "Pagination parameters for Better Proposals list endpoints.",
  {
    page: pageField,
    per_page: perPageField,
  },
  { optional: ["page", "per_page"] },
);
const proposalListInputSchema = s.object(
  "Pagination and filter parameters for listing Better Proposals proposals.",
  {
    page: pageField,
    per_page: perPageField,
    document_type_id: documentTypeIdField,
  },
  { optional: ["page", "per_page", "document_type_id"] },
);
const resourceInputSchema = s.object(
  "Input parameters for retrieving a Better Proposals resource by ID.",
  {
    id: idField,
  },
  { required: ["id"] },
);

function listOutputSchema(description: string, itemDescription: string): JsonSchema {
  return s.object(
    description,
    {
      items: s.array(itemDescription, rawObjectSchema),
      status: s.nullableString("The upstream Better Proposals response status."),
      message: s.nullableString("The upstream Better Proposals message, when returned."),
      raw: rawObjectSchema,
    },
    { required: ["items", "status", "message", "raw"] },
  );
}

function resourceOutputSchema(description: string, resourceDescription: string): JsonSchema {
  return s.object(
    description,
    {
      resource: s.nullable(s.looseObject(resourceDescription)),
      status: s.nullableString("The upstream Better Proposals response status."),
      message: s.nullableString("The upstream Better Proposals message, when returned."),
      raw: rawObjectSchema,
    },
    { required: ["resource", "status", "message", "raw"] },
  );
}

export const betterProposalsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_settings",
    description: "Get current Better Proposals account settings such as tax and timezone defaults.",
    inputSchema: noInputSchema("No input parameters are required to get account settings."),
    outputSchema: resourceOutputSchema(
      "The normalized Better Proposals account settings response.",
      "Account settings returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_brand_settings",
    description: "Get default Better Proposals brand settings such as brand name and tax defaults.",
    inputSchema: noInputSchema("No input parameters are required to get brand settings."),
    outputSchema: resourceOutputSchema(
      "The normalized Better Proposals brand settings response.",
      "Default brand settings returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_proposals",
    description: "List Better Proposals proposals with optional pagination and document type filtering.",
    inputSchema: proposalListInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals proposal list response.",
      "Proposal records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_new_proposals",
    description: "List Better Proposals proposals that are currently in the new proposal lifecycle state.",
    inputSchema: proposalListInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals new proposal list response.",
      "New proposal records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_sent_proposals",
    description: "List Better Proposals proposals that have been sent to recipients.",
    inputSchema: proposalListInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals sent proposal list response.",
      "Sent proposal records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_opened_proposals",
    description: "List Better Proposals proposals that have been opened by recipients.",
    inputSchema: proposalListInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals opened proposal list response.",
      "Opened proposal records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_signed_proposals",
    description: "List Better Proposals proposals that have been signed by recipients.",
    inputSchema: proposalListInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals signed proposal list response.",
      "Signed proposal records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_paid_proposals",
    description: "List Better Proposals proposals that have been paid.",
    inputSchema: proposalListInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals paid proposal list response.",
      "Paid proposal records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_proposal",
    description: "Get details for a single Better Proposals proposal by ID.",
    inputSchema: resourceInputSchema,
    outputSchema: resourceOutputSchema(
      "The normalized Better Proposals proposal detail response.",
      "Proposal details returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_proposal_count",
    description: "Get the total Better Proposals proposal count for the connected account.",
    inputSchema: noInputSchema("No input parameters are required to get proposal count."),
    outputSchema: s.object(
      "The normalized Better Proposals proposal count response.",
      {
        count: s.nullableInteger("The proposal count returned by Better Proposals."),
        status: s.nullableString("The upstream Better Proposals response status."),
        message: s.nullableString("The upstream Better Proposals message, when returned."),
        raw: rawObjectSchema,
      },
      { required: ["count", "status", "message", "raw"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    description: "List Better Proposals templates with optional pagination.",
    inputSchema: pagedInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals template list response.",
      "Template records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_template",
    description: "Get details for a single Better Proposals template by ID.",
    inputSchema: resourceInputSchema,
    outputSchema: resourceOutputSchema(
      "The normalized Better Proposals template detail response.",
      "Template details returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_document_types",
    description: "List Better Proposals document types with optional pagination.",
    inputSchema: pagedInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals document type list response.",
      "Document type records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_quotes",
    description: "List Better Proposals quotes with optional pagination.",
    inputSchema: pagedInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals quote list response.",
      "Quote records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_quote",
    description: "Get details for a single Better Proposals quote by ID.",
    inputSchema: resourceInputSchema,
    outputSchema: resourceOutputSchema(
      "The normalized Better Proposals quote detail response.",
      "Quote details returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List Better Proposals companies with optional pagination.",
    inputSchema: pagedInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals company list response.",
      "Company records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Get details for a single Better Proposals company by ID.",
    inputSchema: resourceInputSchema,
    outputSchema: resourceOutputSchema(
      "The normalized Better Proposals company detail response.",
      "Company details returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_currencies",
    description: "List Better Proposals currencies with optional pagination.",
    inputSchema: pagedInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals currency list response.",
      "Currency records returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_currency",
    description: "Get details for a single Better Proposals currency by ID.",
    inputSchema: resourceInputSchema,
    outputSchema: resourceOutputSchema(
      "The normalized Better Proposals currency detail response.",
      "Currency details returned by the Better Proposals API.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_merge_tags",
    description: "List Better Proposals custom merge tags with optional pagination.",
    inputSchema: pagedInputSchema,
    outputSchema: listOutputSchema(
      "The normalized Better Proposals merge tag list response.",
      "Merge tag records returned by the Better Proposals API.",
    ),
  }),
];

export type BetterProposalsActionName = (typeof betterProposalsActions)[number]["name"];
