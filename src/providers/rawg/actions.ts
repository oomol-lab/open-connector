import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rawg";

const paginationFields: Record<string, JsonSchema> = {
  page: s.positiveInteger("The 1-based page number to retrieve from RAWG."),
  pageSize: s.integer("The number of items to return per page from RAWG, between 1 and 40.", {
    minimum: 1,
    maximum: 40,
  }),
};

const paginationOutputFields: Record<string, JsonSchema> = {
  count: s.integer("Total number of matching resources returned by RAWG."),
  next: s.nullable(s.url("Next page URL returned by RAWG.")),
  previous: s.nullable(s.url("Previous page URL returned by RAWG.")),
};

const entitySummarySchema = s.looseObject("A summary resource returned by RAWG list endpoints.", {
  id: s.positiveInteger("Unique integer identifier returned by RAWG."),
  name: s.nonEmptyString("Display name returned by RAWG."),
  slug: s.string("URL-friendly slug returned by RAWG."),
  games_count: s.integer("Number of related games returned by RAWG when present."),
  image_background: s.url("Background image URL returned by RAWG when present."),
  metacritic: s.integer("Metacritic score returned by RAWG when present."),
  released: s.string("Release date returned by RAWG when present."),
  language: s.string("Language code returned by RAWG when present."),
});

const gameDetailSchema = s.looseObject("Detailed game payload returned by RAWG.", {
  id: s.positiveInteger("Unique integer identifier returned by RAWG."),
  name: s.nonEmptyString("Game title returned by RAWG."),
  slug: s.string("Game slug returned by RAWG."),
  description: s.string("Detailed game description returned by RAWG."),
  released: s.string("Release date returned by RAWG."),
  metacritic: s.integer("Metacritic score returned by RAWG."),
});

const directoryDetailSchema = s.looseObject("Detailed directory payload returned by RAWG.", {
  id: s.positiveInteger("Unique integer identifier returned by RAWG."),
  name: s.nonEmptyString("Display name returned by RAWG."),
  slug: s.string("Slug returned by RAWG."),
  description: s.string("Detailed description returned by RAWG when present."),
  games_count: s.integer("Number of related games returned by RAWG when present."),
  image_background: s.url("Background image URL returned by RAWG when present."),
});

const gameIdSchema = s.union(
  [s.positiveInteger("Positive numeric RAWG game identifier."), s.nonEmptyString("RAWG game slug.")],
  { description: "RAWG game identifier or slug." },
);

const screenshotSchema = s.looseObject("Screenshot resource returned by RAWG.", {
  id: s.integer("Unique integer identifier returned by RAWG."),
  image: s.url("Screenshot image URL returned by RAWG."),
  width: s.integer("Screenshot width returned by RAWG when present."),
  height: s.integer("Screenshot height returned by RAWG when present."),
  is_deleted: s.boolean("Whether RAWG marks the screenshot as deleted when present."),
});

const storeReferenceSchema = s.looseObject("Nested store resource returned by RAWG.", {
  id: s.integer("Unique store identifier returned by RAWG."),
  name: s.string("Store name returned by RAWG."),
  slug: s.string("Store slug returned by RAWG."),
  domain: s.string("Store domain returned by RAWG when present."),
  games_count: s.integer("Number of games linked to the store returned by RAWG when present."),
  image_background: s.url("Store background image URL returned by RAWG when present."),
});

const gameStoreRelationSchema = s.looseObject("Store relation resource returned by RAWG for one game.", {
  id: s.integer("Unique game-store relation identifier returned by RAWG."),
  url: s.url("Store URL returned by RAWG for the game relation."),
  store: storeReferenceSchema,
});

const movieSchema = s.looseObject("Movie resource returned by RAWG for one game.", {
  id: s.positiveInteger("Unique movie identifier returned by RAWG."),
  name: s.string("Movie or trailer title returned by RAWG."),
  preview: s.url("Preview image URL returned by RAWG when present."),
  data: s.looseObject("Nested movie stream URLs returned by RAWG.", {
    "480": s.url("480p trailer URL returned by RAWG when present."),
    max: s.url("Highest-quality trailer URL returned by RAWG when present."),
  }),
});

const redditPostSchema = s.looseObject("Reddit post resource returned by RAWG for one game.", {
  id: s.positiveInteger("Unique Reddit post identifier returned by RAWG."),
  name: s.string("Reddit post title returned by RAWG."),
  url: s.url("Reddit post URL returned by RAWG when present."),
  text: s.string("Reddit post body text returned by RAWG when present."),
  image: s.url("Preview image URL returned by RAWG when present."),
  created: s.string("Post creation timestamp returned by RAWG when present."),
  username: s.string("Reddit author username returned by RAWG when present."),
  username_url: s.url("RAWG author profile URL returned by RAWG when present."),
});

const listGamesInputSchema = s.actionInput(
  {
    search: s.string("Search query used to match game titles in RAWG.", { minLength: 1 }),
    ...paginationFields,
    platforms: s.string("Comma-separated platform identifiers or slugs used to filter games.", { minLength: 1 }),
    genres: s.string("Comma-separated genre identifiers or slugs used to filter games.", { minLength: 1 }),
    stores: s.string("Comma-separated store identifiers used to filter games.", { minLength: 1 }),
    developers: s.string("Comma-separated developer identifiers or slugs used to filter games.", { minLength: 1 }),
    publishers: s.string("Comma-separated publisher identifiers or slugs used to filter games.", { minLength: 1 }),
    tags: s.string("Comma-separated tag identifiers or slugs used to filter games.", { minLength: 1 }),
    dates: s.string("Release date range in YYYY-MM-DD,YYYY-MM-DD format used to filter games.", { minLength: 1 }),
    ordering: s.string("Ordering field passed through to RAWG game listing.", { minLength: 1 }),
    metacritic: s.string("Metacritic score range in min,max format used to filter games.", { minLength: 1 }),
    parentPlatforms: s.string("Comma-separated parent platform identifiers used to filter games.", { minLength: 1 }),
    searchExact: s.boolean("Whether to request exact game name matching from RAWG."),
    searchPrecise: s.boolean("Whether to disable fuzzy search behavior in RAWG."),
    excludeAdditions: s.boolean("Whether to exclude additions and DLC resources."),
    excludeParents: s.boolean("Whether to exclude parent games with additions."),
    excludeGameSeries: s.boolean("Whether to exclude entries that belong to game series."),
  },
  [],
  "Input parameters for listing games from RAWG.",
);

const getGameInputSchema = s.actionInput(
  {
    gameId: gameIdSchema,
  },
  ["gameId"],
  "Input parameters for retrieving one game from RAWG.",
);

const pagedGameSubresourceInputSchema = s.actionInput(
  {
    gameId: gameIdSchema,
    ...paginationFields,
  },
  ["gameId"],
  "Input parameters for listing one paginated RAWG game subresource.",
);

const gameSubresourceInputSchema = s.actionInput(
  {
    gameId: gameIdSchema,
  },
  ["gameId"],
  "Input parameters for retrieving one non-paginated RAWG game subresource.",
);

function listInput(resource: string): JsonSchema {
  return s.actionInput(
    {
      ...paginationFields,
      ordering: s.string(`Ordering field passed through to RAWG ${resource} listing.`, { minLength: 1 }),
    },
    [],
    `Input parameters for listing ${resource} from RAWG.`,
  );
}

function listOutput(key: string, itemSchema: JsonSchema, description: string): JsonSchema {
  return s.actionOutput(
    {
      ...paginationOutputFields,
      [key]: s.array(itemSchema, { description }),
    },
    `Paginated ${key} list returned by RAWG.`,
  );
}

function directoryIdSchema(resource: string): JsonSchema {
  return s.actionInput(
    {
      [`${resource}Id`]: s.positiveInteger(`Unique RAWG ${resource} identifier.`),
    },
    [`${resource}Id`],
    `Input parameters for retrieving one ${resource} from RAWG.`,
  );
}

function directoryOutputSchema(resource: string): JsonSchema {
  return s.actionOutput(
    {
      [resource]: directoryDetailSchema,
    },
    `Detailed ${resource} response returned by RAWG.`,
  );
}

export const rawgActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_games",
    description: "List games from RAWG with optional search, filtering, sorting, and pagination.",
    inputSchema: listGamesInputSchema,
    outputSchema: listOutput("games", entitySummarySchema, "Game summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "get_game",
    description: "Get detailed information for one game from RAWG.",
    inputSchema: getGameInputSchema,
    outputSchema: s.actionOutput({ game: gameDetailSchema }, "Detailed game response returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "list_platforms",
    description: "List gaming platforms from RAWG.",
    inputSchema: listInput("platforms"),
    outputSchema: listOutput("platforms", entitySummarySchema, "Platform summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "get_platform",
    description: "Get detailed information for one platform from RAWG.",
    inputSchema: directoryIdSchema("platform"),
    outputSchema: directoryOutputSchema("platform"),
  }),
  defineProviderAction(service, {
    name: "list_genres",
    description: "List game genres from RAWG.",
    inputSchema: listInput("genres"),
    outputSchema: listOutput("genres", entitySummarySchema, "Genre summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "get_genre",
    description: "Get detailed information for one genre from RAWG.",
    inputSchema: directoryIdSchema("genre"),
    outputSchema: directoryOutputSchema("genre"),
  }),
  defineProviderAction(service, {
    name: "list_stores",
    description: "List video game stores from RAWG.",
    inputSchema: listInput("stores"),
    outputSchema: listOutput("stores", entitySummarySchema, "Store summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "get_store",
    description: "Get detailed information for one store from RAWG.",
    inputSchema: directoryIdSchema("store"),
    outputSchema: directoryOutputSchema("store"),
  }),
  defineProviderAction(service, {
    name: "list_developers",
    description: "List game developers from RAWG.",
    inputSchema: listInput("developers"),
    outputSchema: listOutput("developers", entitySummarySchema, "Developer summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "get_developer",
    description: "Get detailed information for one developer from RAWG.",
    inputSchema: directoryIdSchema("developer"),
    outputSchema: directoryOutputSchema("developer"),
  }),
  defineProviderAction(service, {
    name: "list_publishers",
    description: "List game publishers from RAWG.",
    inputSchema: listInput("publishers"),
    outputSchema: listOutput("publishers", entitySummarySchema, "Publisher summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "get_publisher",
    description: "Get detailed information for one publisher from RAWG.",
    inputSchema: directoryIdSchema("publisher"),
    outputSchema: directoryOutputSchema("publisher"),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List game tags from RAWG.",
    inputSchema: listInput("tags"),
    outputSchema: listOutput("tags", entitySummarySchema, "Tag summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "get_tag",
    description: "Get detailed information for one tag from RAWG.",
    inputSchema: directoryIdSchema("tag"),
    outputSchema: directoryOutputSchema("tag"),
  }),
  defineProviderAction(service, {
    name: "list_parent_platforms",
    description: "List parent platforms from RAWG.",
    inputSchema: listInput("parent platforms"),
    outputSchema: listOutput("parentPlatforms", entitySummarySchema, "Parent platform summaries returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "list_game_screenshots",
    description: "List screenshots for one RAWG game.",
    inputSchema: pagedGameSubresourceInputSchema,
    outputSchema: listOutput("screenshots", screenshotSchema, "Screenshot resources returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "list_game_stores",
    description: "List stores for one RAWG game.",
    inputSchema: pagedGameSubresourceInputSchema,
    outputSchema: listOutput("stores", gameStoreRelationSchema, "Store relation resources returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "list_game_additions",
    description: "List additions for one RAWG game.",
    inputSchema: pagedGameSubresourceInputSchema,
    outputSchema: listOutput("additions", entitySummarySchema, "Addition resources returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "list_game_series",
    description: "List series games related to one RAWG game.",
    inputSchema: pagedGameSubresourceInputSchema,
    outputSchema: listOutput("seriesGames", entitySummarySchema, "Game series resources returned by RAWG."),
  }),
  defineProviderAction(service, {
    name: "list_game_movies",
    description: "Get the RAWG movie payload for one game.",
    inputSchema: gameSubresourceInputSchema,
    outputSchema: s.actionOutput({ movie: movieSchema }, "Movie response documented by RAWG for one game."),
  }),
  defineProviderAction(service, {
    name: "list_game_reddit_posts",
    description: "Get the RAWG Reddit post payload for one game.",
    inputSchema: gameSubresourceInputSchema,
    outputSchema: s.actionOutput({ post: redditPostSchema }, "Reddit post response documented by RAWG for one game."),
  }),
];
