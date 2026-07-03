import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "beamer";

const iso639LanguageSchema = s.string("A two-letter ISO-639 language code used by Beamer for localized content.", {
  minLength: 2,
  maxLength: 2,
});
const isoFeedLanguageSchema = s.string("A two-letter ISO-639 language code used by Beamer for feed localization.", {
  minLength: 2,
  maxLength: 2,
});
const isoDateTimeSchema = s.dateTime("An ISO-8601 date-time string accepted by the Beamer API.");
const boostedAnnouncementSchema = s.stringEnum("The boosted announcement treatment to apply to the post.", [
  "top-bar",
  "popup",
  "snippet",
  "tooltip",
]);

const postTranslationSchema = s.object(
  "One translated content variant returned by the Beamer API.",
  {
    title: s.string("The translated post title."),
    content: s.string("The translated post content in plain text."),
    contentHtml: s.string("The translated post content in HTML format."),
    language: s.string("The language code for this translation."),
    category: s.string("The translated category label when one exists."),
    linkUrl: s.string("The CTA URL for this translation when one exists."),
    linkText: s.string("The CTA label for this translation when one exists."),
    images: s.array("The image URLs embedded in this translation.", s.string("One image URL.")),
  },
  {
    optional: ["title", "content", "contentHtml", "language", "category", "linkUrl", "linkText", "images"],
  },
);

const postSchema = s.object(
  "One Beamer changelog post returned by the API.",
  {
    id: s.string("The Beamer post identifier."),
    date: s.string("The post publication date in ISO-8601 format."),
    dueDate: s.string("The post expiration date in ISO-8601 format."),
    published: s.boolean("Whether the post is published."),
    pinned: s.boolean("Whether the post is pinned."),
    showInWidget: s.boolean("Whether the post appears in the embedded widget."),
    showInStandalone: s.boolean("Whether the post appears in the standalone feed."),
    category: s.string("The post category identifier."),
    boostedAnnouncement: s.string("The boosted announcement treatment applied to the post."),
    translations: s.array("The translated content blocks available for this post.", postTranslationSchema),
    filter: s.string("The segmentation filter string applied to the post."),
    filterUrl: s.string("The URL targeting filter applied to the post."),
    autoOpen: s.boolean("Whether the post auto-opens the sidebar for recipients."),
    editionDate: s.string("The last edition date in ISO-8601 format."),
    feedbackEnabled: s.boolean("Whether feedback is enabled for the post."),
    reactionsEnabled: s.boolean("Whether reactions are enabled for the post."),
    views: s.integer("The total view count for the post."),
    uniqueViews: s.integer("The unique view count for the post."),
    clicks: s.integer("The tracked click count for the post."),
    feedbacks: s.integer("The feedback count for the post."),
    positiveReactions: s.integer("The positive reaction count for the post."),
    neutralReactions: s.integer("The neutral reaction count for the post."),
    negativeReactions: s.integer("The negative reaction count for the post."),
  },
  {
    optional: [
      "date",
      "dueDate",
      "published",
      "pinned",
      "showInWidget",
      "showInStandalone",
      "category",
      "boostedAnnouncement",
      "translations",
      "filter",
      "filterUrl",
      "autoOpen",
      "editionDate",
      "feedbackEnabled",
      "reactionsEnabled",
      "views",
      "uniqueViews",
      "clicks",
      "feedbacks",
      "positiveReactions",
      "neutralReactions",
      "negativeReactions",
    ],
  },
);

const feedInputSchema = s.object(
  "Query parameters for retrieving the standalone Beamer feed URL.",
  {
    language: isoFeedLanguageSchema,
    filterByUrl: s.boolean("Whether URL segmentation should be applied to the feed URL."),
    filter: s.string("An optional segmentation filter string to apply.", { minLength: 1 }),
  },
  { optional: ["language", "filterByUrl", "filter"] },
);

const countUnreadInputSchema = s.object(
  "Query parameters for counting unread posts for one Beamer end-user context.",
  {
    userId: s.string("The end-user identifier used together with filterByUserId.", { minLength: 1 }),
    filterByUserId: s.boolean("Whether to include single-user posts that match the provided userId."),
  },
  { optional: ["userId", "filterByUserId"] },
);

const listPostsInputSchema = s.object(
  "Query parameters for listing existing posts from the Beamer API.",
  {
    filter: s.string("Retrieve posts with a matching segmentation filter.", { minLength: 1 }),
    forceFilter: s.string("Only retrieve posts that match this segmentation filter.", { minLength: 1 }),
    filterUrl: s.string("Retrieve posts with a matching segmentation URL.", { minLength: 1 }),
    dateFrom: isoDateTimeSchema,
    dateTo: isoDateTimeSchema,
    language: iso639LanguageSchema,
    category: s.string("Retrieve posts for a specific category.", { minLength: 1 }),
    published: s.boolean("Whether to retrieve only published or only draft posts."),
    archived: s.boolean("Whether to retrieve only archived or only non-archived posts."),
    expired: s.boolean("Whether to retrieve only expired or only non-expired posts."),
    filterByUserId: s.boolean("Whether to include single-user posts that match the provided userId."),
    userFirstName: s.string("The end user's first name used for analytics attribution.", { minLength: 1 }),
    userLastName: s.string("The end user's last name used for analytics attribution.", { minLength: 1 }),
    userEmail: s.string("The end user's email used for analytics attribution.", { minLength: 1 }),
    userId: s.string("The end-user identifier used for analytics attribution.", { minLength: 1 }),
    traceableLinks: s.boolean("Whether Beamer should rewrite links into tracked URLs."),
    ignoreRequestDetails: s.boolean(
      "Whether backend request IP, browser, OS, and geolocation details should be ignored.",
    ),
    saveViews: s.boolean("Whether fetching these posts should save views in Beamer analytics."),
    maxResults: s.integer("The maximum number of posts to return.", { minimum: 1, maximum: 10 }),
    page: s.integer("The results page to retrieve.", { minimum: 1 }),
    ignoreFilters: s.boolean("Whether Beamer should ignore segmentation filters when returning posts."),
  },
  {
    optional: [
      "filter",
      "forceFilter",
      "filterUrl",
      "dateFrom",
      "dateTo",
      "language",
      "category",
      "published",
      "archived",
      "expired",
      "filterByUserId",
      "userFirstName",
      "userLastName",
      "userEmail",
      "userId",
      "traceableLinks",
      "ignoreRequestDetails",
      "saveViews",
      "maxResults",
      "page",
      "ignoreFilters",
    ],
  },
);

const createPostInputSchema = s.object(
  "The JSON body for creating one Beamer changelog post.",
  {
    title: s.array(
      "The translated post titles in Beamer order.",
      s.string("One translated post title.", { minLength: 1 }),
      {
        minItems: 1,
      },
    ),
    content: s.array(
      "The translated post content values in the same order as the titles.",
      s.string("One translated post content string.", { minLength: 1 }),
      { minItems: 1 },
    ),
    category: s.string("The category to assign to the new post.", { minLength: 1 }),
    publish: s.boolean("Whether to publish the post immediately."),
    archive: s.boolean("Whether the post should start archived."),
    pinned: s.boolean("Whether the post should be pinned to the top of the feed."),
    showInWidget: s.boolean("Whether the post should appear in the embedded widget."),
    showInStandalone: s.boolean("Whether the post should appear in the standalone feed."),
    boostedAnnouncement: boostedAnnouncementSchema,
    linkUrl: s.array("The translated CTA URLs in Beamer order.", s.string("One translated CTA URL.", { minLength: 1 })),
    linkText: s.array(
      "The translated CTA labels in Beamer order.",
      s.string("One translated CTA label.", { minLength: 1 }),
    ),
    linksInNewWindow: s.boolean("Whether links should open in a new tab or window."),
    date: isoDateTimeSchema,
    dueDate: isoDateTimeSchema,
    language: s.array("The translated language codes in Beamer order.", iso639LanguageSchema),
    filter: s.string("The segmentation filter string for this post.", { minLength: 1 }),
    filterUserId: s.string("The single-user filter identifier or semicolon-separated identifiers for this post.", {
      minLength: 1,
    }),
    filterUrl: s.string("The URL targeting filter string for this post.", { minLength: 1 }),
    enableFeedback: s.boolean("Whether feedback should be enabled for the post."),
    enableReactions: s.boolean("Whether reactions should be enabled for the post."),
    enableSocialShare: s.boolean("Whether social sharing should be enabled for the post."),
    autoOpen: s.boolean("Whether the Beamer sidebar should auto-open for recipients."),
    sendPushNotification: s.boolean("Whether a web push notification should be sent for the post."),
    userEmail: s.string("The email of the Beamer account user creating this post.", { minLength: 1 }),
    fixedBoostedAnnouncement: s.boolean("Whether a boosted top-bar announcement should stay fixed on screen."),
  },
  {
    optional: [
      "category",
      "publish",
      "archive",
      "pinned",
      "showInWidget",
      "showInStandalone",
      "boostedAnnouncement",
      "linkUrl",
      "linkText",
      "linksInNewWindow",
      "date",
      "dueDate",
      "language",
      "filter",
      "filterUserId",
      "filterUrl",
      "enableFeedback",
      "enableReactions",
      "enableSocialShare",
      "autoOpen",
      "sendPushNotification",
      "userEmail",
      "fixedBoostedAnnouncement",
    ],
  },
);

export const beamerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_feed_url",
    description: "Retrieve the standalone Beamer feed URL with optional language and segmentation filters.",
    inputSchema: feedInputSchema,
    outputSchema: s.object(
      "The standalone feed URL returned by Beamer.",
      {
        feedUrl: s.string("The standalone Beamer feed URL."),
      },
      { required: ["feedUrl"] },
    ),
  }),
  defineProviderAction(service, {
    name: "count_unread_posts",
    description: "Count unread Beamer posts for one end-user context.",
    inputSchema: countUnreadInputSchema,
    outputSchema: s.object(
      "The unread post count returned by Beamer.",
      {
        count: s.integer("The number of unread posts."),
      },
      { required: ["count"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    description: "List existing Beamer posts with optional changelog, audience, and analytics filters.",
    inputSchema: listPostsInputSchema,
    outputSchema: s.object(
      "The Beamer posts returned by the connector.",
      {
        posts: s.array("The Beamer posts that matched the request.", postSchema),
      },
      { required: ["posts"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_post",
    description: "Create a new Beamer changelog post with one or more translations.",
    inputSchema: createPostInputSchema,
    outputSchema: s.object(
      "The Beamer post created by the connector.",
      {
        post: postSchema,
      },
      { required: ["post"] },
    ),
  }),
];

export type BeamerActionName = (typeof beamerActions)[number]["name"];
