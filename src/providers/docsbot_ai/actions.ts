import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "docsbot_ai";

const teamIdSchema = s.nonEmptyString("The DocsBot team ID.");
const botIdSchema = s.nonEmptyString("The DocsBot bot ID.");
const rawTeamSchema = s.looseObject("The raw DocsBot team object returned by the API.");
const rawBotSchema = s.looseObject("The raw DocsBot bot object returned by the API.");
const rawSourceSchema = s.looseObject("The raw DocsBot query source object returned by the API.");

const usageFieldsSchema = {
  questionCount: s.nullable(s.number("The AI credits used by this DocsBot resource in the current billing period.")),
  pageCount: s.nullable(s.number("The number of pages crawled by this DocsBot resource.")),
  sourceCount: s.nullable(s.number("The number of sources crawled by this DocsBot resource.")),
  chunkCount: s.nullable(s.number("The number of chunks crawled by this DocsBot resource.")),
};
const teamSchema = s.object("A normalized DocsBot team.", {
  id: s.string("The DocsBot team ID."),
  name: s.string("The DocsBot team name."),
  createdAt: s.nullable(s.string("The team creation timestamp when returned by DocsBot.")),
  status: s.nullable(s.string("The DocsBot team status such as ready or pending.")),
  botCount: s.nullable(s.number("The number of bots in the team when returned by DocsBot.")),
  ...usageFieldsSchema,
  raw: rawTeamSchema,
});
const botSchema = s.object("A normalized DocsBot bot.", {
  id: s.string("The DocsBot bot ID."),
  name: s.string("The DocsBot bot name."),
  description: s.nullable(s.string("The DocsBot bot description when returned by DocsBot.")),
  privacy: s.nullable(s.string("The DocsBot bot privacy such as public or private.")),
  status: s.nullable(s.string("The DocsBot bot status such as ready, pending, indexing, or processing.")),
  model: s.nullable(s.string("The DocsBot model configured for the bot when returned.")),
  createdAt: s.nullable(s.string("The bot creation timestamp when returned by DocsBot.")),
  ...usageFieldsSchema,
  raw: rawBotSchema,
});
const querySourceSchema = s.object("A normalized DocsBot query source.", {
  title: s.nullable(s.string("The source title returned by DocsBot.")),
  url: s.nullable(s.string("The source URL returned by DocsBot.")),
  fileId: s.nullable(s.string("The file ID that can be used with fetch_document.")),
  page: s.nullable(s.integer("The PDF page number for the source when returned by DocsBot.")),
  content: s.string("The raw text content returned by DocsBot."),
  raw: rawSourceSchema,
});
const tagsSchema = s.array(
  "DocsBot source tags used to filter retrieval results.",
  s.nonEmptyString("One DocsBot source tag key."),
);
const searchInputSchema = s.object(
  "Input for searching DocsBot bot training data.",
  {
    teamId: teamIdSchema,
    botId: botIdSchema,
    query: s.nonEmptyString("The natural-language search query."),
    top_k: s.nullable(s.integer("The maximum number of chunks to return.", { minimum: 1 })),
    autocut: s.anyOf("Whether to apply autocut grouping, or the number of groups to return.", [
      s.boolean("Whether to apply autocut grouping."),
      s.integer("The number of autocut groups to return.", { minimum: 1 }),
    ]),
    alpha: s.nullable(
      s.number("Hybrid balance where 0 is keyword search and 1 is semantic search.", {
        minimum: 0,
        maximum: 1,
      }),
    ),
    use_glossary: s.boolean("Whether DocsBot should apply bot glossary rewrites to the query."),
    tags: s.nullable(tagsSchema),
    include_untagged: s.boolean("Whether untagged chunks should be included when tags are supplied."),
  },
  {
    optional: ["top_k", "autocut", "alpha", "use_glossary", "tags", "include_untagged"],
  },
);

export type DocsbotAiActionName =
  | "list_teams"
  | "get_team"
  | "list_bots"
  | "get_bot"
  | "semantic_search"
  | "fetch_document";

export const docsbotAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_teams",
    description: "List DocsBot teams visible to the API key user.",
    inputSchema: s.object("No input is required to list DocsBot teams.", {}),
    outputSchema: s.object("DocsBot teams visible to the API key user.", {
      teams: s.array("The DocsBot teams returned by the API.", teamSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Get a DocsBot team by ID.",
    inputSchema: s.object("Input for retrieving a DocsBot team.", {
      teamId: teamIdSchema,
    }),
    outputSchema: s.object("The requested DocsBot team.", {
      team: teamSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_bots",
    description: "List DocsBot bots in a team.",
    inputSchema: s.object("Input for listing DocsBot bots in a team.", {
      teamId: teamIdSchema,
    }),
    outputSchema: s.object("DocsBot bots in the requested team.", {
      bots: s.array("The DocsBot bots returned by the API.", botSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_bot",
    description: "Get a DocsBot bot by team and bot ID.",
    inputSchema: s.object("Input for retrieving a DocsBot bot.", {
      teamId: teamIdSchema,
      botId: botIdSchema,
    }),
    outputSchema: s.object("The requested DocsBot bot.", {
      bot: botSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "semantic_search",
    description: "Search a DocsBot bot's trained source chunks by natural-language query.",
    inputSchema: searchInputSchema,
    outputSchema: s.object("DocsBot semantic search results.", {
      results: s.array("The DocsBot query sources returned by semantic search.", querySourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "fetch_document",
    description: "Fetch the full reconstructed document text for a DocsBot search result file ID.",
    inputSchema: s.object("Input for fetching a reconstructed DocsBot document.", {
      teamId: teamIdSchema,
      botId: botIdSchema,
      fileId: s.nonEmptyString("The DocsBot file ID returned by semantic_search."),
    }),
    outputSchema: s.object("The reconstructed DocsBot document returned by fetch.", {
      document: querySourceSchema,
    }),
  }),
];
