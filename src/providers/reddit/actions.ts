import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { redditEditScope, redditIdentityScope, redditReadScope, redditSubmitScope } from "./scopes.ts";

const service = "reddit";

const rawObjectSchema = s.looseObject("The raw object returned by the Reddit Data API.");
const fullnameSchema = s.nonEmptyString(
  "A Reddit fullname such as t3_postid for a post or t1_commentid for a comment.",
);
const paginationFields: Record<string, JsonSchema> = {
  after: s.nullableString("The fullname cursor for the next page, or null."),
  before: s.nullableString("The fullname cursor for the previous page, or null."),
};
const listingInputFields: Record<string, JsonSchema> = {
  subreddit: s.nonEmptyString("The subreddit name without the r/ prefix."),
  limit: s.integer("The maximum number of items to return, from 1 through 100.", {
    minimum: 1,
    maximum: 100,
  }),
  after: s.string("The Reddit fullname cursor after which to continue the listing."),
  before: s.string("The Reddit fullname cursor before which to continue the listing."),
};
const listingOutputSchema = s.object("A normalized page of Reddit posts.", {
  posts: s.array("The posts returned in this page.", rawObjectSchema),
  ...paginationFields,
});

function action(input: {
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    providerPermissions: input.requiredScopes,
  });
}

export const redditActions: ActionDefinition[] = [
  action({
    name: "get_me",
    description: "Get the profile of the authenticated Reddit account.",
    requiredScopes: [redditIdentityScope],
    inputSchema: s.object({}, { description: "The input payload for the authenticated Reddit profile." }),
    outputSchema: s.object("The authenticated Reddit profile response.", { account: rawObjectSchema }),
  }),
  action({
    name: "list_posts",
    description: "List posts from a subreddit using a supported Reddit sort order.",
    requiredScopes: [redditReadScope],
    inputSchema: s.object(
      "The input payload for listing Reddit posts.",
      {
        ...listingInputFields,
        sort: s.stringEnum("The Reddit listing sort order.", ["hot", "new", "top", "controversial", "rising"]),
        time: s.stringEnum("The time range for top or controversial listings.", [
          "hour",
          "day",
          "week",
          "month",
          "year",
          "all",
        ]),
      },
      { optional: ["sort", "time", "limit", "after", "before"] },
    ),
    outputSchema: listingOutputSchema,
  }),
  action({
    name: "search_posts",
    description: "Search Reddit posts globally or within one subreddit.",
    requiredScopes: [redditReadScope],
    inputSchema: s.object(
      "The input payload for searching Reddit posts.",
      {
        query: s.nonEmptyString("The Reddit search query."),
        subreddit: listingInputFields.subreddit,
        sort: s.stringEnum("The Reddit search sort order.", ["relevance", "hot", "top", "new", "comments"]),
        time: s.stringEnum("The search time range.", ["hour", "day", "week", "month", "year", "all"]),
        limit: listingInputFields.limit,
        after: listingInputFields.after,
        before: listingInputFields.before,
      },
      { optional: ["subreddit", "sort", "time", "limit", "after", "before"] },
    ),
    outputSchema: listingOutputSchema,
  }),
  action({
    name: "get_post_comments",
    description: "Get a Reddit post and its comment tree.",
    requiredScopes: [redditReadScope],
    inputSchema: s.object(
      "The input payload for retrieving a Reddit comment tree.",
      {
        postId: s.nonEmptyString("The base-36 Reddit post ID without the t3_ prefix."),
        subreddit: listingInputFields.subreddit,
        sort: s.stringEnum("The comment sort order.", [
          "confidence",
          "top",
          "new",
          "controversial",
          "old",
          "random",
          "qa",
          "live",
        ]),
        limit: s.positiveInteger("The maximum number of comments to return."),
        depth: s.positiveInteger("The maximum depth of comment subtrees to return."),
      },
      { optional: ["subreddit", "sort", "limit", "depth"] },
    ),
    outputSchema: s.object("A Reddit post and its recursive comment listing.", {
      post: rawObjectSchema,
      comments: s.array("The top-level comment things, including nested replies.", rawObjectSchema),
    }),
  }),
  action({
    name: "create_post",
    description: "Create a text or link post in a subreddit as the authenticated Reddit user.",
    requiredScopes: [redditSubmitScope],
    inputSchema: s.object(
      "The input payload for creating a Reddit post.",
      {
        subreddit: listingInputFields.subreddit,
        title: s.nonEmptyString("The title of the Reddit post.", { maxLength: 300 }),
        kind: s.stringEnum("Whether to create a text post or link post.", ["self", "link"]),
        text: s.string("The Markdown body for a text post."),
        url: s.url("The destination URL for a link post."),
        flairId: s.string("The subreddit link flair template ID to apply.", { maxLength: 36 }),
        flairText: s.string("The custom link flair text to apply when supported.", { maxLength: 64 }),
        sendReplies: s.boolean("Whether Reddit should send inbox replies for the post."),
        nsfw: s.boolean("Whether the post should be marked not safe for work."),
        spoiler: s.boolean("Whether the post should be marked as a spoiler."),
      },
      { optional: ["text", "url", "flairId", "flairText", "sendReplies", "nsfw", "spoiler"] },
    ),
    outputSchema: s.object("The Reddit post created by the request.", {
      post: rawObjectSchema,
      url: s.nullableString("The resulting Reddit post URL, or null."),
    }),
  }),
  action({
    name: "create_comment",
    description: "Reply to a Reddit post or comment as the authenticated Reddit user.",
    requiredScopes: [redditSubmitScope],
    inputSchema: s.object("The input payload for creating a Reddit comment.", {
      parentFullname: fullnameSchema,
      text: s.nonEmptyString("The Markdown body of the comment."),
    }),
    outputSchema: s.object("The Reddit comment created by the request.", { comment: rawObjectSchema }),
  }),
  action({
    name: "edit_content",
    description: "Replace the body of the authenticated user's Reddit comment or text post.",
    requiredScopes: [redditEditScope],
    inputSchema: s.object("The input payload for editing Reddit content.", {
      fullname: fullnameSchema,
      text: s.nonEmptyString("The replacement Markdown body."),
    }),
    outputSchema: s.object("The Reddit content returned after editing.", { content: rawObjectSchema }),
  }),
  action({
    name: "delete_content",
    description: "Permanently delete the authenticated user's Reddit post or comment.",
    requiredScopes: [redditEditScope],
    inputSchema: s.object("The input payload for deleting Reddit content.", { fullname: fullnameSchema }),
    outputSchema: s.object("The result of deleting Reddit content.", {
      accepted: s.boolean("Whether Reddit accepted the deletion request."),
      fullname: fullnameSchema,
    }),
  }),
];
