import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mendeley";
const readScope = "mendeley.documents.read";
const writeScope = "mendeley.documents.write";

const rawDocumentSchema = s.looseObject("The raw Mendeley document object.");
const documentViewSchema = s.anyOf("The Mendeley document view to request.", [
  s.literal("bib", { description: "Return bibliographic fields." }),
  s.literal("client", { description: "Return client synchronization fields." }),
  s.literal("tags", { description: "Return tag fields." }),
  s.literal("patent", { description: "Return patent fields." }),
  s.literal("all", { description: "Return all available document fields." }),
]);
const authorSchema = s.object(
  "An author attached to a Mendeley document.",
  {
    firstName: s.string("The author's first name."),
    lastName: s.string("The author's last name."),
  },
  { optional: ["firstName", "lastName"] },
);
const documentMetadataProperties = {
  title: s.nonEmptyString("The document title.", { maxLength: 500 }),
  type: s.nonEmptyString("The Mendeley document type, such as journal, book, or report."),
  source: s.string("The publication or source name."),
  year: s.integer("The publication year."),
  abstract: s.string("The document abstract."),
  authors: s.array("The document authors.", authorSchema),
  identifiers: s.looseObject("External identifiers keyed by scheme, such as doi or isbn."),
  tags: s.stringArray("The user-defined document tags."),
};
const paginationProperties = {
  nextMarker: s.nullable(s.string("The marker for the next page, or null.")),
  previousMarker: s.nullable(s.string("The marker for the previous page, or null.")),
  firstMarker: s.nullable(s.string("The marker for the first page, or null.")),
  lastMarker: s.nullable(s.string("The marker for the last page, or null.")),
};

export const mendeleyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_documents",
    description: "List document metadata from the authorized user's Mendeley library.",
    requiredScopes: [readScope],
    inputSchema: s.object(
      "Input parameters for listing Mendeley documents.",
      {
        view: documentViewSchema,
        groupId: s.nonEmptyString("The group UUID whose documents should be listed."),
        modifiedSince: s.string("Return documents modified since this ISO 8601 timestamp."),
        deletedSince: s.string("Return documents deleted since this ISO 8601 timestamp."),
        limit: s.integer("The maximum number of documents on this page.", {
          minimum: 1,
          maximum: 500,
        }),
        sort: s.string("The documented Mendeley field used to sort results."),
        order: s.anyOf("The result sort direction.", [
          s.literal("asc", { description: "Sort in ascending order." }),
          s.literal("desc", { description: "Sort in descending order." }),
        ]),
        marker: s.string("A page marker returned by an earlier call."),
      },
      {
        optional: ["view", "groupId", "modifiedSince", "deletedSince", "limit", "sort", "order", "marker"],
      },
    ),
    outputSchema: s.object("One page of Mendeley documents.", {
      documents: s.array("The documents returned on this page.", rawDocumentSchema),
      ...paginationProperties,
    }),
  }),
  defineProviderAction(service, {
    name: "get_document",
    description: "Get document metadata from the authorized user's Mendeley library by ID.",
    requiredScopes: [readScope],
    inputSchema: s.object(
      "Input parameters for getting a Mendeley document.",
      {
        documentId: s.nonEmptyString("The Mendeley document UUID."),
        view: documentViewSchema,
      },
      { optional: ["view"] },
    ),
    outputSchema: s.object("The requested Mendeley document.", {
      document: rawDocumentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_document",
    description: "Create a document in the authorized user's Mendeley library from JSON metadata.",
    requiredScopes: [writeScope],
    inputSchema: s.object("Metadata for creating a Mendeley document.", documentMetadataProperties, {
      optional: ["source", "year", "abstract", "authors", "identifiers", "tags"],
    }),
    outputSchema: s.object("The newly created Mendeley document.", {
      document: rawDocumentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_document",
    description: "Update selected metadata fields on a Mendeley library document.",
    requiredScopes: [writeScope],
    inputSchema: s.object(
      "Metadata fields to update on a Mendeley document.",
      {
        documentId: s.nonEmptyString("The Mendeley document UUID."),
        ...documentMetadataProperties,
      },
      {
        optional: ["title", "type", "source", "year", "abstract", "authors", "identifiers", "tags"],
      },
    ),
    outputSchema: s.object("The updated Mendeley document.", {
      document: rawDocumentSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_document",
    description: "Permanently delete a document from the authorized user's Mendeley library.",
    requiredScopes: [writeScope],
    inputSchema: s.object("Input parameters for deleting a Mendeley document.", {
      documentId: s.nonEmptyString("The Mendeley document UUID."),
    }),
    outputSchema: s.object("The document deletion result.", {
      deleted: s.boolean("Whether Mendeley accepted the permanent deletion."),
      documentId: s.nonEmptyString("The deleted Mendeley document UUID."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_catalog",
    description: "Search Mendeley's public catalog for document metadata.",
    requiredScopes: [readScope],
    inputSchema: s.object(
      "Input parameters for searching the Mendeley catalog.",
      {
        query: s.nonEmptyString("Text matched against catalog titles, abstracts, and author names."),
        limit: s.integer("The maximum number of catalog documents on this page.", {
          minimum: 1,
          maximum: 100,
        }),
        marker: s.string("A page marker returned by an earlier call."),
      },
      { optional: ["limit", "marker"] },
    ),
    outputSchema: s.object("One page of Mendeley catalog search results.", {
      documents: s.array("The catalog documents returned on this page.", rawDocumentSchema),
      ...paginationProperties,
    }),
  }),
  defineProviderAction(service, {
    name: "get_catalog_document",
    description: "Get a public Mendeley catalog document by its Mendeley ID.",
    requiredScopes: [readScope],
    inputSchema: s.object("Input parameters for getting a catalog document.", {
      documentId: s.nonEmptyString("The Mendeley catalog document UUID."),
    }),
    outputSchema: s.object("The requested Mendeley catalog document.", {
      document: rawDocumentSchema,
    }),
  }),
];

export const mendeleyProviderScopes: Record<string, string> = {
  all: "all",
};
