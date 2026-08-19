import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ghost";

const contentRawSchema = s.looseObject("The raw Ghost Content API object.");
const settingsRawSchema = s.looseObject("The raw Ghost settings object.");
const metaSchema = s.nullable(s.looseObject("The Ghost Content API pagination metadata."));

const browseInputSchema = s.object(
  "Input for browsing Ghost content resources.",
  {
    limit: s.integer("The maximum number of resources to request from Ghost.", {
      minimum: 1,
      maximum: 100,
    }),
    page: s.integer("The one-based page number to request from Ghost.", { minimum: 1 }),
    include: s.nonEmptyString("Comma-separated Ghost include expression, such as authors,tags or count.posts."),
    fields: s.nonEmptyString("Comma-separated Ghost field list to return."),
    formats: s.nonEmptyString("Comma-separated Ghost formats to return, such as html,plaintext."),
    filter: s.nonEmptyString("Ghost Content API filter expression."),
    order: s.nonEmptyString("Ghost Content API order expression."),
  },
  { optional: ["limit", "page", "include", "fields", "formats", "filter", "order"] },
);

const readInputSchema = s.object(
  "Input for reading one Ghost content resource.",
  {
    id: s.nonEmptyString("The Ghost resource ID."),
    slug: s.nonEmptyString("The Ghost resource slug."),
    include: s.nonEmptyString("Comma-separated Ghost include expression, such as authors,tags or count.posts."),
    fields: s.nonEmptyString("Comma-separated Ghost field list to return."),
    formats: s.nonEmptyString("Comma-separated Ghost formats to return, such as html,plaintext."),
  },
  { optional: ["id", "slug", "include", "fields", "formats"] },
);

function listOutputSchema(description: string, key: string): JsonSchema {
  return s.object(description, {
    [key]: s.array(`The Ghost ${key} returned by the Content API.`, contentRawSchema),
    meta: metaSchema,
  });
}

function singleOutputSchema(description: string, key: string): JsonSchema {
  return s.object(description, {
    [key.slice(0, -1)]: s.nullable(contentRawSchema),
  });
}

export const ghostActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_posts",
    description: "List published posts from the connected Ghost site.",
    requiredScopes: [],
    inputSchema: browseInputSchema,
    outputSchema: listOutputSchema("Ghost posts browse response.", "posts"),
  }),
  defineProviderAction(service, {
    name: "get_post",
    description: "Get one published Ghost post by ID or slug.",
    requiredScopes: [],
    inputSchema: readInputSchema,
    outputSchema: singleOutputSchema("Ghost post read response.", "posts"),
  }),
  defineProviderAction(service, {
    name: "list_pages",
    description: "List published pages from the connected Ghost site.",
    requiredScopes: [],
    inputSchema: browseInputSchema,
    outputSchema: listOutputSchema("Ghost pages browse response.", "pages"),
  }),
  defineProviderAction(service, {
    name: "get_page",
    description: "Get one published Ghost page by ID or slug.",
    requiredScopes: [],
    inputSchema: readInputSchema,
    outputSchema: singleOutputSchema("Ghost page read response.", "pages"),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List public tags from the connected Ghost site.",
    requiredScopes: [],
    inputSchema: browseInputSchema,
    outputSchema: listOutputSchema("Ghost tags browse response.", "tags"),
  }),
  defineProviderAction(service, {
    name: "get_tag",
    description: "Get one public Ghost tag by ID or slug.",
    requiredScopes: [],
    inputSchema: readInputSchema,
    outputSchema: singleOutputSchema("Ghost tag read response.", "tags"),
  }),
  defineProviderAction(service, {
    name: "list_authors",
    description: "List public authors from the connected Ghost site.",
    requiredScopes: [],
    inputSchema: browseInputSchema,
    outputSchema: listOutputSchema("Ghost authors browse response.", "authors"),
  }),
  defineProviderAction(service, {
    name: "get_author",
    description: "Get one public Ghost author by ID or slug.",
    requiredScopes: [],
    inputSchema: readInputSchema,
    outputSchema: singleOutputSchema("Ghost author read response.", "authors"),
  }),
  defineProviderAction(service, {
    name: "read_settings",
    description: "Read public settings for the connected Ghost site.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to read Ghost settings.", {}),
    outputSchema: s.object("Ghost settings response.", {
      settings: s.nullable(settingsRawSchema),
    }),
  }),
];
