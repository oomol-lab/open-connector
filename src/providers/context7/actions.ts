import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "context7";

const querySchema = s.string("The original question or task used to rank results by relevance.", {
  minLength: 1,
  maxLength: 500,
});

const fastSchema = s.boolean("Whether to skip LLM reranking and return faster vector-search results.");

const librarySchema = s.looseObject("A library matched by Context7.", {
  id: s.string("The Context7 library ID."),
  title: s.string("The display name of the library."),
  description: s.string("A short description of the library."),
  branch: s.string("The source branch tracked by Context7."),
  lastUpdateDate: s.dateTime("The date and time when the library was last updated."),
  state: s.stringEnum("The current Context7 processing state.", [
    "finalized",
    "initial",
    "processing",
    "error",
    "delete",
  ]),
  totalTokens: s.integer("The total number of documentation tokens."),
  totalSnippets: s.integer("The total number of documentation snippets."),
  stars: s.integer("The GitHub star count when available."),
  trustScore: s.integer("The source reputation score from 0 to 10.", {
    minimum: 0,
    maximum: 10,
  }),
  benchmarkScore: s.number("The documentation quality score from 0 to 100.", {
    minimum: 0,
    maximum: 100,
  }),
  versions: s.array("The available library version tags.", s.string("A version tag.")),
});

const codeExampleSchema = s.looseRequiredObject(
  "One code example from a documentation snippet.",
  {
    language: s.string("The programming language of the example."),
    code: s.string("The example source code."),
  },
  { optional: [] },
);

const codeSnippetSchema = s.looseRequiredObject(
  "A relevant code snippet.",
  {
    codeTitle: s.string("The title of the code snippet."),
    codeDescription: s.string("A description of what the code snippet demonstrates."),
    codeLanguage: s.string("The primary programming language of the snippet."),
    codeTokens: s.integer("The token count of the snippet."),
    codeId: s.string("The source URL or identifier for the code snippet."),
    pageTitle: s.string("The title of the documentation page."),
    codeList: s.array("The code examples included in the snippet.", codeExampleSchema),
  },
  { optional: [] },
);

const infoSnippetSchema = s.object(
  "A relevant documentation text snippet.",
  {
    content: s.string("The documentation content."),
    contentTokens: s.integer("The token count of the documentation content."),
    pageId: s.string("The source page URL or identifier."),
    breadcrumb: s.string("The documentation navigation breadcrumb."),
  },
  {
    required: ["content", "contentTokens"],
    additionalProperties: true,
  },
);

const rulesSchema = s.looseObject("Optional rules associated with the library or teamspace.", {
  global: s.array("Global team rules.", s.string("A global rule.")),
  libraryOwn: s.array("Rules defined by the library owner.", s.string("A library owner rule.")),
  libraryTeam: s.array("Team rules for the library.", s.string("A library team rule.")),
});

export type Context7ActionName = "search_libraries" | "get_documentation_context";

export const context7Actions: ProviderActionDefinition<Context7ActionName>[] = [
  defineProviderAction(service, {
    name: "search_libraries",
    operationType: "read",
    description: "Search Context7 for libraries ranked against a question or task.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for searching Context7 libraries.",
      {
        libraryName: s.string("The library name to search for.", {
          minLength: 1,
          maxLength: 500,
        }),
        query: querySchema,
        fast: fastSchema,
      },
      { optional: ["fast"] },
    ),
    outputSchema: s.object(
      "The ranked Context7 library search response.",
      {
        results: s.array("The matching libraries ranked by relevance.", librarySchema),
        searchFilterApplied: s.boolean("Whether teamspace public-library access settings filtered the results."),
      },
      {
        required: ["results", "searchFilterApplied"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_documentation_context",
    operationType: "read",
    description: "Retrieve relevant Context7 documentation and code snippets for a library.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving Context7 documentation context.",
      {
        libraryId: s.string("The Context7 library ID, such as /vercel/next.js.", {
          minLength: 1,
          maxLength: 500,
          pattern: "^/[^/]+/[^/]+([/@][^/]+)?$",
        }),
        query: querySchema,
        fast: fastSchema,
      },
      { optional: ["fast"] },
    ),
    outputSchema: s.object(
      "The Context7 documentation context response.",
      {
        codeSnippets: s.array("The relevant code snippets.", codeSnippetSchema),
        infoSnippets: s.array("The relevant documentation text snippets.", infoSnippetSchema),
        rules: rulesSchema,
      },
      {
        required: ["codeSnippets", "infoSnippets"],
        additionalProperties: true,
      },
    ),
  }),
];
