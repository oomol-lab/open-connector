import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stack_overflow_for_teams";

function positiveInteger(description: string) {
  return s.integer(description, { minimum: 1 });
}
const pageSize = s.anyOf("The number of records to return per page.", [
  s.literal(15, { description: "Return 15 records per page." }),
  s.literal(30, { description: "Return 30 records per page." }),
  s.literal(50, { description: "Return 50 records per page." }),
  s.literal(100, { description: "Return 100 records per page." }),
]);
const order = s.stringEnum("The result sort order.", ["asc", "desc"]);
const rawItem = s.looseRequiredObject("One resource returned by the Stack Internal API.", {});
const paginationFields = {
  totalCount: s.integer("The total number of matching records."),
  pageSize: s.integer("The number of records returned per page."),
  page: s.integer("The current page number."),
  totalPages: s.integer("The total number of available pages."),
};

function paginatedOutput(description: string) {
  return s.object(
    description,
    {
      ...paginationFields,
      sort: s.string("The sort mode applied by Stack Internal."),
      order: s.string("The sort order applied by Stack Internal."),
      items: s.array("The resources on the current page.", rawItem),
    },
    { optional: ["order"] },
  );
}

export const stackOverflowForTeamsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Search questions, answers, and articles in the connected Stack Internal team.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for searching Stack Internal knowledge.",
      {
        query: s.string("The text query to search for."),
        page: positiveInteger("The page number to retrieve."),
        pageSize,
        sort: s.stringEnum("The search result sort mode.", ["relevance", "newest", "active", "score"]),
      },
      { optional: ["query", "page", "pageSize", "sort"] },
    ),
    outputSchema: paginatedOutput("The paginated Stack Internal search results."),
  }),
  defineProviderAction(service, {
    name: "list_questions",
    operationType: "read",
    description: "List questions from the connected Stack Internal team with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Stack Internal questions.",
      {
        page: positiveInteger("The page number to retrieve."),
        pageSize,
        sort: s.stringEnum("The question sort mode.", ["activity", "creation", "score"]),
        order,
        isAnswered: s.boolean("Whether to return only answered or unanswered questions."),
        hasAcceptedAnswer: s.boolean("Whether to filter by the presence of an accepted answer."),
        authorId: positiveInteger("The author user ID to filter by."),
        from: s.dateTime("The earliest question creation timestamp to include."),
        to: s.dateTime("The latest question creation timestamp to include."),
      },
      {
        optional: ["page", "pageSize", "sort", "order", "isAnswered", "hasAcceptedAnswer", "authorId", "from", "to"],
      },
    ),
    outputSchema: paginatedOutput("The paginated questions returned by Stack Internal."),
  }),
  defineProviderAction(service, {
    name: "get_question",
    operationType: "read",
    description: "Retrieve one question from the connected Stack Internal team by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Stack Internal question.", {
      questionId: positiveInteger("The question ID to retrieve."),
    }),
    outputSchema: s.object("The requested Stack Internal question.", {
      question: rawItem,
    }),
  }),
  defineProviderAction(service, {
    name: "list_answers",
    operationType: "read",
    description: "List answers for one question in the connected Stack Internal team.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing answers to a Stack Internal question.",
      {
        questionId: positiveInteger("The question ID whose answers should be listed."),
        page: positiveInteger("The page number to retrieve."),
        pageSize,
        sort: s.stringEnum("The answer sort mode.", ["score", "modified", "creation"]),
        order,
      },
      { optional: ["page", "pageSize", "sort", "order"] },
    ),
    outputSchema: paginatedOutput("The paginated answers returned by Stack Internal."),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    operationType: "read",
    description: "List tags from the connected Stack Internal team with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for listing Stack Internal tags.",
      {
        page: positiveInteger("The page number to retrieve."),
        pageSize,
        sort: s.stringEnum("The tag sort mode.", ["name", "postCount", "creationDate"]),
        order,
        partialName: s.string("A partial tag name to match."),
        hasSmes: s.boolean("Whether returned tags must have subject matter experts."),
        hasSynonyms: s.boolean("Whether returned tags must have synonyms."),
      },
      { optional: ["page", "pageSize", "sort", "order", "partialName", "hasSmes", "hasSynonyms"] },
    ),
    outputSchema: paginatedOutput("The paginated tags returned by Stack Internal."),
  }),
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the user represented by the connected Stack Internal personal access token.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve the current Stack Internal user.", {}),
    outputSchema: s.object("The current Stack Internal user.", {
      user: rawItem,
    }),
  }),
];
