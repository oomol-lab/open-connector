import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "guru";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const upstreamObjectSchema = s.looseObject("A Guru object returned by the API.");
const linkSchema = s.looseObject("Pagination links parsed from the Guru Link response header.", {
  next: s.url("The URL for the next page of results."),
  previous: s.url("The URL for the previous page of results."),
  nextToken: s.string("The next-page token parsed from the next link URL."),
  previousToken: s.string("The previous-page token parsed from the previous link URL."),
});

const queryTypeSchema = s.stringEnum("The Guru search query type.", [
  "cards",
  "questions",
  "archived",
  "draft",
  "legacy",
  "search_cards",
]);

const sortFieldSchema = s.stringEnum("The Guru card search sort field.", [
  "lastModified",
  "lastModifiedBy",
  "boardCount",
  "verificationState",
  "copyCount",
  "viewCount",
  "favoriteCount",
  "followerCount",
  "dateCreated",
  "verificationInterval",
  "verifier",
  "owner",
  "originalOwner",
  "lastVerifiedBy",
  "lastVerified",
  "verificationReason",
  "popularity",
  "unverifiedViewsCopies",
  "nextVerificationDate",
  "collection",
  "title",
  "followedDate",
  "pendingAutoArchive",
  "relevancy",
]);

const sortOrderSchema = s.stringEnum("The Guru sort order.", ["ASC", "DESC"]);

export const guruActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_identity",
    description: "Get the Guru user or collection identity for the authenticated API token.",
    inputSchema: s.object("Input parameters for getting the current Guru identity.", {}),
    outputSchema: s.object("The response returned when getting the current Guru identity.", {
      identity: upstreamObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_cards",
    description: "Search Guru cards visible to the authenticated API token.",
    inputSchema: s.object(
      "Input parameters for searching Guru cards.",
      {
        q: nonEmptyString("The Guru Query Language string to search with."),
        searchTerms: nonEmptyString("Search terms to pass to Guru."),
        queryType: queryTypeSchema,
        showArchived: s.boolean("Whether to include archived cards in search results."),
        maxResults: s.integer("Maximum number of cards to return, up to 50.", { minimum: 1, maximum: 50 }),
        sortField: sortFieldSchema,
        sortOrder: sortOrderSchema,
        includeCardAttributes: s.boolean("Whether Guru should include card attributes."),
        token: nonEmptyString("Paging token returned by a previous Guru Link header."),
      },
      {
        optional: [
          "q",
          "searchTerms",
          "queryType",
          "showArchived",
          "maxResults",
          "sortField",
          "sortOrder",
          "includeCardAttributes",
          "token",
        ],
      },
    ),
    outputSchema: s.object(
      "The response returned when searching Guru cards.",
      {
        cards: s.array("Guru cards returned for the search.", upstreamObjectSchema),
        links: linkSchema,
      },
      { optional: ["links"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_card",
    description: "Get a Guru card with additional details by card ID.",
    inputSchema: s.object("Input parameters for getting a Guru card.", {
      cardId: nonEmptyString("The Guru card ID."),
    }),
    outputSchema: s.object("The response returned when getting a Guru card.", {
      card: upstreamObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_collections",
    description: "List Guru collections visible to the authenticated API token.",
    inputSchema: s.object(
      "Input parameters for listing Guru collections.",
      {
        search: nonEmptyString("Search term for filtering Guru collections."),
        sortField: nonEmptyString("Guru collection sort field."),
        sortDir: nonEmptyString("Guru collection sort order."),
        filter: nonEmptyString("Guru collection filter expression."),
      },
      { optional: ["search", "sortField", "sortDir", "filter"] },
    ),
    outputSchema: s.object("The response returned when listing Guru collections.", {
      collections: s.array("Guru collections returned by the API.", upstreamObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_team_stats",
    description: "Get Guru trust and card-count statistics for a team.",
    inputSchema: s.object("Input parameters for getting Guru team stats.", {
      teamId: nonEmptyString("The Guru team ID."),
    }),
    outputSchema: s.object("The response returned when getting Guru team stats.", {
      teamStats: upstreamObjectSchema,
    }),
  }),
];
