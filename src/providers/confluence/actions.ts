import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  confluencePageReadScope,
  confluencePageWriteScope,
  confluenceSearchScope,
  confluenceSpaceReadScope,
} from "./scopes.ts";

const service = "confluence";

const optionalLimit = s.integer("Maximum number of items to return.", {
  minimum: 1,
  maximum: 100,
});
const optionalCursor = s.nonEmptyString("Opaque pagination cursor returned by Confluence.");
const looseRecord = s.looseObject("Provider-specific Confluence payload fields.");

const spaceSchema = s.looseObject("A Confluence space.", {
  id: s.string("The Confluence space ID."),
  key: s.string("The Confluence space key."),
  name: s.string("The Confluence space name."),
  type: s.string("The Confluence space type."),
  status: s.string("The Confluence space status."),
  homepageId: s.nullable(s.string("The ID of the space homepage, or null when unavailable.")),
  raw: looseRecord,
});

const pageVersionSchema = s.looseObject("A Confluence page version.", {
  number: s.integer("The Confluence page version number."),
  message: s.string("The Confluence page version message."),
  minorEdit: s.boolean("Whether this version is marked as a minor edit."),
});

const pageSchema = s.looseObject("A Confluence page.", {
  id: s.string("The Confluence page ID."),
  status: s.string("The Confluence page status."),
  title: s.string("The Confluence page title."),
  spaceId: s.string("The Confluence space ID containing the page."),
  parentId: s.nullable(s.string("The parent page ID, or null when unavailable.")),
  createdAt: s.string("The Confluence page creation timestamp."),
  version: s.nullable(pageVersionSchema),
  body: s.nullable(looseRecord),
  raw: looseRecord,
});

const searchResultSchema = s.looseObject("A Confluence search result.", {
  id: s.string("The Confluence content ID when returned."),
  type: s.string("The Confluence content type when returned."),
  title: s.string("The Confluence content title when returned."),
  url: s.string("The Confluence web URL when returned."),
  excerpt: s.string("The Confluence search excerpt when returned."),
  containerTitle: s.string("The Confluence container title when returned."),
  raw: looseRecord,
});

const paginationSchema = s.object("Confluence pagination metadata.", {
  nextCursor: s.nullable(s.string("Cursor for the next Confluence page, or null when no next page is available.")),
});

export const confluenceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_content",
    description: "Search Confluence content with CQL and return normalized result metadata plus pagination.",
    requiredScopes: [confluenceSearchScope],
    inputSchema: s.object(
      "Input parameters for searching Confluence content.",
      {
        cql: s.nonEmptyString("The Confluence Query Language string to execute."),
        limit: optionalLimit,
        cursor: optionalCursor,
      },
      { optional: ["limit", "cursor"] },
    ),
    outputSchema: s.object("The normalized Confluence search response.", {
      results: s.array("The matching Confluence search results.", searchResultSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_spaces",
    description: "List Confluence spaces and return normalized space metadata plus pagination.",
    requiredScopes: [confluenceSpaceReadScope],
    inputSchema: s.object(
      "Input parameters for listing Confluence spaces.",
      {
        limit: optionalLimit,
        cursor: optionalCursor,
        type: s.stringEnum("Filter spaces by Confluence space type.", ["global", "personal"]),
        status: s.stringEnum("Filter spaces by Confluence space status.", ["current", "archived"]),
      },
      { optional: ["limit", "cursor", "type", "status"] },
    ),
    outputSchema: s.object("The normalized Confluence spaces response.", {
      spaces: s.array("The Confluence spaces returned by the request.", spaceSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Get a Confluence page by ID and optionally include its body representation.",
    requiredScopes: [confluencePageReadScope],
    inputSchema: s.object(
      "Input parameters for retrieving a Confluence page.",
      {
        pageId: s.nonEmptyString("The Confluence page ID."),
        bodyFormat: s.stringEnum("The body representation to include.", [
          "storage",
          "atlas_doc_format",
          "view",
          "export_view",
          "styled_view",
        ]),
      },
      { optional: ["bodyFormat"] },
    ),
    outputSchema: s.object("The normalized Confluence page response.", {
      page: pageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_page",
    description: "Create a Confluence page using a JSON-friendly body value and return the created page.",
    requiredScopes: [confluencePageWriteScope],
    inputSchema: s.object(
      "Input parameters for creating a Confluence page.",
      {
        spaceId: s.nonEmptyString("The Confluence space ID where the page will be created."),
        title: s.nonEmptyString("The title for the new Confluence page."),
        body: s.nonEmptyString("The page body value for the selected representation."),
        bodyRepresentation: s.stringEnum("The representation used for the page body.", ["storage", "atlas_doc_format"]),
        parentId: s.nonEmptyString("The parent Confluence page ID."),
        status: s.stringEnum("The Confluence page status to create.", ["current", "draft"]),
      },
      { optional: ["bodyRepresentation", "parentId", "status"] },
    ),
    outputSchema: s.object("The normalized Confluence create page response.", {
      page: pageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_page",
    description: "Update a Confluence page title, body, or status using an explicit next version number.",
    requiredScopes: [confluencePageWriteScope],
    inputSchema: s.object(
      "Input parameters for updating a Confluence page.",
      {
        pageId: s.nonEmptyString("The Confluence page ID."),
        title: s.nonEmptyString("The updated Confluence page title."),
        versionNumber: s.positiveInteger("The next Confluence page version number."),
        body: s.nonEmptyString("The updated page body value for the selected representation."),
        bodyRepresentation: s.stringEnum("The representation used for the page body.", ["storage", "atlas_doc_format"]),
        status: s.stringEnum("The updated Confluence page status.", ["current", "draft"]),
        versionMessage: s.nonEmptyString("A message stored with the new Confluence page version."),
        minorEdit: s.boolean("Whether the update should be marked as a minor edit."),
      },
      { optional: ["body", "bodyRepresentation", "status", "versionMessage", "minorEdit"] },
    ),
    outputSchema: s.object("The normalized Confluence update page response.", {
      page: pageSchema,
    }),
  }),
];

export type ConfluenceActionName = "search_content" | "list_spaces" | "get_page" | "create_page" | "update_page";
