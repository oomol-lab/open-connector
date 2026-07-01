import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "forem";

const positiveId = (description: string) => s.positiveInteger(description);
const pageField = s.positiveInteger("The pagination page number.");
const articlePerPageField = s.integer("The number of articles to return per page. Forem defaults to 30.", {
  minimum: 1,
  maximum: 1000,
});
const tagPerPageField = s.integer("The number of tags to return per page. Forem defaults to 10.", {
  minimum: 1,
  maximum: 1000,
});
const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const tagListInput = s.array(
  "The Forem tags to send as a comma-separated upstream value.",
  nonEmptyString("One Forem tag name."),
  { minItems: 1 },
);
const rawObject = s.looseObject("The raw object returned by Forem.");
const rawArray = s.array("The raw array returned by Forem.", s.unknown("One raw Forem item."));

const looseUserSchema = s.looseObject("A Forem user profile.", {
  type_of: s.string("The Forem record type."),
  id: s.integer("The Forem user ID."),
  username: s.string("The Forem username."),
  name: s.string("The Forem display name."),
  email: s.nullable(s.string("The user email address when returned by Forem.")),
  summary: s.nullable(s.string("The user profile summary when returned by Forem.")),
  twitter_username: s.nullable(s.string("The user's Twitter username when returned by Forem.")),
  github_username: s.nullable(s.string("The user's GitHub username when returned by Forem.")),
  website_url: s.nullable(s.string("The user website URL when returned by Forem.")),
  location: s.nullable(s.string("The user location when returned by Forem.")),
  joined_at: s.string("The user join date returned by Forem."),
  profile_image: s.string("The user profile image URL."),
  badge_ids: s.array("The Forem badge IDs awarded to the user.", s.integer("One badge ID.")),
  followers_count: s.integer("The number of followers reported by Forem."),
});

const sharedUserSchema = s.looseObject("The Forem user summary attached to a resource.", {
  name: s.string("The user's display name."),
  username: s.string("The Forem username."),
  twitter_username: s.nullable(s.string("The user's Twitter username when returned by Forem.")),
  github_username: s.nullable(s.string("The user's GitHub username when returned by Forem.")),
  user_id: s.integer("The Forem user ID."),
  website_url: s.nullable(s.string("The user website URL when returned by Forem.")),
  profile_image: s.string("The user profile image URL."),
  profile_image_90: s.string("The 90px user profile image URL."),
});

const organizationSchema = s.looseObject("The Forem organization attached to a resource.", {
  name: s.string("The organization display name."),
  username: s.string("The organization username."),
  slug: s.string("The organization slug."),
  profile_image: s.string("The organization profile image URL."),
  profile_image_90: s.string("The 90px organization profile image URL."),
});

const flareTagSchema = s.looseObject("The Forem flare tag attached to an article.", {
  name: s.string("The flare tag name."),
  bg_color_hex: s.nullable(s.string("The flare tag background color in hex.")),
  text_color_hex: s.nullable(s.string("The flare tag text color in hex.")),
});

const articleSchema = s.looseObject("A Forem article.", {
  type_of: s.string("The Forem record type."),
  id: s.integer("The Forem article ID."),
  title: s.string("The article title."),
  description: s.string("The article description."),
  readable_publish_date: s.string("The human-readable publish date returned by Forem."),
  slug: s.string("The article slug."),
  path: s.string("The article path."),
  url: s.string("The article URL."),
  comments_count: s.integer("The number of comments on the article."),
  public_reactions_count: s.integer("The number of public reactions on the article."),
  collection_id: s.nullable(s.integer("The collection ID when the article belongs to a collection.")),
  published_timestamp: s.string("The article publish timestamp."),
  language: s.nullable(s.string("The article language code when returned by Forem.")),
  subforem_id: s.nullable(s.integer("The subforem ID when returned by Forem.")),
  positive_reactions_count: s.integer("The number of positive reactions on the article."),
  cover_image: s.nullable(s.string("The article cover image URL when returned by Forem.")),
  social_image: s.string("The social preview image URL returned by Forem."),
  canonical_url: s.string("The canonical URL returned by Forem."),
  created_at: s.string("The article creation timestamp."),
  edited_at: s.nullable(s.string("The article edit timestamp when returned by Forem.")),
  crossposted_at: s.nullable(s.string("The crosspost timestamp when returned by Forem.")),
  published_at: s.nullable(s.string("The article publish timestamp when returned by Forem.")),
  last_comment_at: s.string("The last-comment timestamp returned by Forem."),
  reading_time_minutes: s.integer("The estimated article reading time in minutes."),
  tag_list: s.anyOf(
    [
      s.string("The article tags as a comma-separated string."),
      s.array("The article tags as an array.", s.string("One article tag.")),
    ],
    { description: "The article tag list as returned by Forem." },
  ),
  tags: s.anyOf(
    [
      s.string("The article tags as a comma-separated string."),
      s.array("The article tags as an array.", s.string("One article tag.")),
    ],
    { description: "The article tags as returned by Forem." },
  ),
  body_html: s.string("The rendered article HTML when returned by Forem."),
  body_markdown: s.string("The markdown article body when returned by Forem."),
  user: sharedUserSchema,
  organization: organizationSchema,
  flare_tag: flareTagSchema,
});

const commentSchema = s.looseObject("A Forem comment thread node.", {
  type_of: s.string("The Forem record type."),
  id_code: s.string("The Forem comment ID code."),
  created_at: s.string("The comment creation timestamp."),
  body_html: s.string("The rendered comment body HTML."),
  image_url: s.string("The image URL attached to a podcast comment when returned by Forem."),
  user: sharedUserSchema,
  children: s.array("Nested child comments.", s.looseObject("One nested Forem comment.")),
});

const tagSchema = s.looseObject("A Forem tag.", {
  id: s.integer("The Forem tag ID."),
  name: s.string("The Forem tag name."),
  bg_color_hex: s.nullable(s.string("The tag background color in hex.")),
  text_color_hex: s.nullable(s.string("The tag text color in hex.")),
  short_summary: s.nullable(s.string("The tag short summary when returned by Forem.")),
});

const paginationInput = {
  page: pageField,
  perPage: articlePerPageField,
};

const articlesOutput = s.object("The response returned when listing Forem articles.", {
  articles: s.array("The Forem articles returned by the request.", articleSchema),
  raw: rawArray,
});

const articleOutput = s.object("The response returned for one Forem article.", {
  article: articleSchema,
  raw: rawObject,
});

const articleWriteFields: Record<string, JsonSchema> = {
  title: nonEmptyString("The article title."),
  bodyMarkdown: nonEmptyString("The article body in Markdown."),
  published: s.boolean("Whether the article should be published."),
  series: s.nullable(s.string("The article series name.")),
  mainImage: s.nullable(s.url("The main image URL for the article.")),
  canonicalUrl: s.nullable(s.url("The canonical URL for the article.")),
  description: s.string("The article description."),
  tags: tagListInput,
  organizationId: s.nullable(positiveId("The Forem organization ID for the article.")),
};
const articleMutableKeys = Object.keys(articleWriteFields);

const updateArticleInputSchema = {
  ...s.object(
    "The input payload for updating a Forem article.",
    {
      articleId: positiveId("The Forem article ID to update."),
      ...articleWriteFields,
    },
    {
      optional: articleMutableKeys,
    },
  ),
  anyOf: articleMutableKeys.map((key) => ({ required: [key] })),
};

const listCommentsInputSchema = {
  ...s.object(
    "The input payload for listing Forem comments.",
    {
      articleId: positiveId("The Forem article ID whose comments should be listed."),
      podcastEpisodeId: positiveId("The Forem podcast episode ID whose comments should be listed."),
      page: pageField,
      perPage: articlePerPageField,
    },
    { optional: ["articleId", "podcastEpisodeId", "page", "perPage"] },
  ),
  oneOf: [
    { required: ["articleId"], not: { required: ["podcastEpisodeId"] } },
    { required: ["podcastEpisodeId"], not: { required: ["articleId"] } },
  ],
};

export const foremActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the Forem user associated with the connected API key.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving the current Forem user.", {}),
    outputSchema: s.object("The response returned for the current Forem user.", {
      user: looseUserSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_articles",
    description: "List published Forem articles with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Forem articles.",
      {
        ...paginationInput,
        tag: nonEmptyString("Return articles containing this tag."),
        tags: tagListInput,
        tagsExclude: tagListInput,
        username: nonEmptyString("Return articles for this user or organization username."),
        state: s.stringEnum("The Forem article list state filter.", ["fresh", "rising", "all"]),
        top: positiveId("Return the most popular articles from the last N days."),
        collectionId: positiveId("Return articles belonging to this collection ID."),
      },
      {
        optional: ["page", "perPage", "tag", "tags", "tagsExclude", "username", "state", "top", "collectionId"],
      },
    ),
    outputSchema: articlesOutput,
  }),
  defineProviderAction(service, {
    name: "list_my_articles",
    description: "List articles owned by the authenticated Forem user.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing authenticated user's Forem articles.",
      {
        scope: s.stringEnum("Which authenticated-user article collection to list.", [
          "published",
          "unpublished",
          "all",
          "default",
        ]),
        ...paginationInput,
      },
      { optional: ["scope", "page", "perPage"] },
    ),
    outputSchema: articlesOutput,
  }),
  defineProviderAction(service, {
    name: "get_article",
    description: "Retrieve one published Forem article by numeric ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Forem article by ID.", {
      articleId: positiveId("The Forem article ID."),
    }),
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "get_article_by_path",
    description: "Retrieve one published Forem article by username and slug.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Forem article by path.", {
      username: nonEmptyString("The Forem username from the article path."),
      slug: nonEmptyString("The Forem article slug."),
    }),
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "create_article",
    description: "Create a Forem article for the authenticated user.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating a Forem article.", articleWriteFields, {
      optional: ["published", "series", "mainImage", "canonicalUrl", "description", "tags", "organizationId"],
    }),
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "update_article",
    description: "Update an existing Forem article by numeric ID.",
    requiredScopes: [],
    inputSchema: updateArticleInputSchema,
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "list_comments",
    description: "List Forem comments for an article or podcast episode as threaded conversations.",
    requiredScopes: [],
    inputSchema: listCommentsInputSchema,
    outputSchema: s.object("The response returned when listing Forem comments.", {
      comments: s.array("The Forem comments returned by the request.", commentSchema),
      raw: rawArray,
    }),
  }),
  defineProviderAction(service, {
    name: "get_comment",
    description: "Retrieve one Forem comment thread by numeric ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Forem comment.", {
      commentId: positiveId("The Forem comment ID."),
    }),
    outputSchema: s.object("The response returned for one Forem comment.", {
      comment: commentSchema,
      raw: rawObject,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Forem tags ordered by popularity.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Forem tags.",
      {
        page: pageField,
        perPage: tagPerPageField,
      },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: s.object("The response returned when listing Forem tags.", {
      tags: s.array("The Forem tags returned by the request.", tagSchema),
      raw: rawArray,
    }),
  }),
];

export type ForemActionName =
  | "get_current_user"
  | "list_articles"
  | "list_my_articles"
  | "get_article"
  | "get_article_by_path"
  | "create_article"
  | "update_article"
  | "list_comments"
  | "get_comment"
  | "list_tags";

export const foremArticleMutableKeys: readonly string[] = articleMutableKeys;
