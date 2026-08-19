import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zhihu";

const queryField = s.nonEmptyString("The search query keyword.");

const commentInfoSchema = s.looseObject("A selected comment returned with a content item.", {
  Content: s.string("The comment content."),
});

const searchItemSchema = s.looseObject("A Zhihu content search result item.", {
  Title: s.string("The content title."),
  ContentType: s.string("The content type, such as Answer or Article."),
  ContentID: s.string("The content identifier."),
  ContentText: s.string("The content excerpt. Highlighted fragments may include em tags."),
  Url: s.url("The source URL with Zhihu Open Platform attribution parameters."),
  CommentCount: s.integer("The number of comments."),
  VoteUpCount: s.integer("The number of upvotes."),
  AuthorName: s.string("The author display name."),
  AuthorAvatar: s.string("The author avatar URL."),
  AuthorBadge: s.string("The author certification badge image URL."),
  AuthorBadgeText: s.string("The author certification badge text."),
  EditTime: s.integer("The published or last edited Unix timestamp in seconds."),
  CommentInfoList: s.array("Selected comments returned for this content item.", commentInfoSchema),
  AuthorityLevel: s.string("The content authority level from 1 to 4."),
  RankingScore: s.number("The ranking score returned by Zhihu Search."),
});

const hotListItemSchema = s.looseObject("A Zhihu hot list item.", {
  Title: s.string("The hot list title."),
  Url: s.url("The Zhihu URL for the hot list item."),
  ThumbnailUrl: s.string("The thumbnail image URL, or an empty string when no image is available."),
  Summary: s.string("The item summary, or an empty string when no summary is available."),
});

const zhidaMessageSchema = s.object("A message in a Zhida chat completion request.", {
  role: s.stringEnum("The message role.", ["system", "user", "assistant"]),
  content: s.nonEmptyString("The message content."),
});

const zhidaChoiceSchema = s.looseObject("A Zhida completion choice.", {
  index: s.integer("The choice index."),
  message: s.looseObject("The assistant message returned by Zhida.", {
    role: s.string("The returned message role."),
    reasoning_content: s.string("The model reasoning content when returned."),
    content: s.string("The final answer content."),
  }),
  finish_reason: s.string("The reason the choice finished."),
});

export const zhihuActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "zhihu_search",
    description: "Search Zhihu content and return matching questions, answers, and articles.",
    inputSchema: s.object(
      "Input parameters for a Zhihu site search request.",
      {
        query: queryField,
        count: s.integer("The number of Zhihu search results to return, up to 10.", {
          minimum: 1,
          maximum: 10,
        }),
      },
      { optional: ["count"] },
    ),
    outputSchema: s.looseObject("A Zhihu site search response.", {
      Code: s.integer("The upstream response code."),
      Message: s.string("The upstream response message."),
      Data: s.looseObject("The Zhihu site search response data.", {
        HasMore: s.boolean("Whether more results are available. Zhihu currently returns false."),
        SearchHashId: s.string("The search request identifier."),
        Items: s.array("Search result items.", searchItemSchema),
        EmptyReason: s.string("The reason returned when the result set is empty."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "global_search",
    description: "Search the global web index exposed by Zhihu Open Platform.",
    inputSchema: s.object(
      "Input parameters for a Zhihu global search request.",
      {
        query: queryField,
        count: s.integer("The number of global search results to return, up to 20.", {
          minimum: 1,
          maximum: 20,
        }),
        filter: s.nonEmptyString("Advanced filter expression for host or publish_time constraints."),
        searchDB: s.stringEnum("The search index database to query.", ["all", "realtime", "static"]),
      },
      { optional: ["count", "filter", "searchDB"] },
    ),
    outputSchema: s.looseObject("A Zhihu global search response.", {
      Code: s.integer("The upstream response code."),
      Message: s.string("The upstream response message."),
      Data: s.looseObject("The Zhihu global search response data.", {
        HasMore: s.boolean("Whether more results are available."),
        Items: s.array("Search result items.", searchItemSchema),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "hot_list",
    description: "Get the current Zhihu hot list with titles, links, thumbnails, and summaries.",
    inputSchema: s.object(
      "Input parameters for a Zhihu hot list request.",
      {
        limit: s.integer("The number of hot list items to return, up to 30.", {
          minimum: 1,
          maximum: 30,
        }),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.looseObject("A Zhihu hot list response.", {
      Code: s.integer("The upstream response code."),
      Message: s.string("The upstream response message."),
      Data: s.looseObject("The Zhihu hot list response data.", {
        Total: s.integer("The number of returned hot list items."),
        Items: s.array("Hot list items.", hotListItemSchema),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "zhida",
    description: "Create a non-streaming Zhihu Zhida chat completion.",
    inputSchema: s.object("Input parameters for a non-streaming Zhida chat completion request.", {
      model: s.stringEnum("The Zhida model tier.", ["zhida-fast-1p5", "zhida-thinking-1p5", "zhida-agent"]),
      messages: s.array("Conversation messages to send to Zhida.", zhidaMessageSchema, {
        minItems: 1,
      }),
    }),
    outputSchema: s.looseObject("A non-streaming Zhida chat completion response.", {
      id: s.string("The completion identifier."),
      object: s.string("The response object type."),
      created: s.integer("The creation Unix timestamp in seconds."),
      model: s.string("The model that produced the response."),
      choices: s.array("Completion choices.", zhidaChoiceSchema),
    }),
  }),
];
