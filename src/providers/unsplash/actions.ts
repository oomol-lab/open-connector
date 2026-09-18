import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "unsplash";

const pageSchema = s.positiveInteger("The 1-based page number to retrieve.");
const perPageSchema = s.integer("The number of items to return per page, between 1 and 30.", {
  minimum: 1,
  maximum: 30,
});
const photoFeedOrderBySchema = s.stringEnum("The sort order supported by the Unsplash photo listing endpoints.", [
  "latest",
  "oldest",
  "popular",
]);
const searchPhotoOrderBySchema = s.stringEnum("The sort order supported by the Unsplash photo search endpoint.", [
  "relevant",
  "latest",
]);
const topicOrderBySchema = s.stringEnum("The sort order supported by the Unsplash topic listing endpoint.", [
  "position",
  "latest",
  "oldest",
  "popular",
]);
const orientationSchema = s.stringEnum("The photo orientation filter to apply.", ["landscape", "portrait", "squarish"]);
const colorSchema = s.stringEnum("The color filter to apply to photo search results.", [
  "black_and_white",
  "black",
  "white",
  "yellow",
  "orange",
  "red",
  "purple",
  "magenta",
  "green",
  "teal",
  "blue",
]);
const contentFilterSchema = s.stringEnum("The safety filter level to apply to supported Unsplash requests.", [
  "low",
  "high",
]);
const stringArraySchema = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "One identifier value.",
  });

const photoUrlsSchema = s.looseObject("The photo URLs returned by Unsplash in multiple sizes.");
const photoLinksSchema = s.looseObject("The related links attached to the Unsplash photo resource.");
const photoUserSchema = s.looseObject("The user metadata attached to the photo.");

const photoSummarySchema = s.object(
  "A summary photo resource returned by Unsplash.",
  {
    id: s.string("The unique identifier of the photo."),
    slug: s.string("The public slug of the photo."),
    description: s.nullableString("The description of the photo when Unsplash provides it."),
    alt_description: s.nullableString("The alternative description of the photo when Unsplash provides it."),
    width: s.number("The width of the photo in pixels."),
    height: s.number("The height of the photo in pixels."),
    color: s.string("The representative HEX color of the photo."),
    blur_hash: s.string("The blur hash value of the photo."),
    urls: photoUrlsSchema,
    links: photoLinksSchema,
    user: photoUserSchema,
  },
  {
    optional: [
      "slug",
      "description",
      "alt_description",
      "width",
      "height",
      "color",
      "blur_hash",
      "urls",
      "links",
      "user",
    ],
  },
);

const photoDetailSchema = s.object(
  "A detailed photo resource returned by Unsplash.",
  {
    id: s.string("The unique identifier of the photo."),
    slug: s.string("The public slug of the photo."),
    description: s.nullableString("The description of the photo when Unsplash provides it."),
    alt_description: s.nullableString("The alternative description of the photo when Unsplash provides it."),
    width: s.number("The width of the photo in pixels."),
    height: s.number("The height of the photo in pixels."),
    color: s.string("The representative HEX color of the photo."),
    blur_hash: s.string("The blur hash value of the photo."),
    urls: photoUrlsSchema,
    links: photoLinksSchema,
    user: photoUserSchema,
    created_at: s.string("The creation timestamp of the photo."),
    liked_by_user: s.boolean("Whether the authenticated user liked the photo."),
    likes: s.number("The total number of likes on the photo."),
    current_user_collections: s.array(
      "The current user collections returned with the photo.",
      s.looseObject("One current user collection reference."),
    ),
  },
  {
    optional: [
      "slug",
      "description",
      "alt_description",
      "width",
      "height",
      "color",
      "blur_hash",
      "urls",
      "links",
      "user",
      "created_at",
      "liked_by_user",
      "likes",
      "current_user_collections",
    ],
  },
);

const topicSchema = s.object(
  "A topic resource returned by Unsplash.",
  {
    id: s.string("The unique identifier of the topic."),
    slug: s.string("The topic slug."),
    title: s.string("The display title of the topic."),
    description: s.nullableString("The description of the topic when Unsplash provides it."),
    featured: s.boolean("Whether the topic is marked as featured."),
    total_photos: s.number("The total number of photos in the topic."),
    links: s.looseObject("The related links attached to the Unsplash topic resource."),
    cover_photo: s.looseObject("The cover photo attached to the topic when Unsplash provides it."),
  },
  {
    optional: ["slug", "description", "featured", "total_photos", "links", "cover_photo"],
  },
);

export const unsplashActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_photos",
    operationType: "read",
    description: "List the latest public photos from Unsplash.",
    inputSchema: s.actionInput(
      {
        page: pageSchema,
        perPage: perPageSchema,
        orderBy: photoFeedOrderBySchema,
      },
      [],
      "The input payload for listing the latest public photos from Unsplash.",
    ),
    outputSchema: s.actionOutput(
      {
        photos: s.array("The public photo summaries returned by Unsplash.", photoSummarySchema),
      },
      "The latest public photos returned by Unsplash.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_photos",
    operationType: "read",
    description: "Search photos on Unsplash using keyword and filter inputs.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString("The search query to run against Unsplash photos."),
        page: pageSchema,
        perPage: perPageSchema,
        orderBy: searchPhotoOrderBySchema,
        color: colorSchema,
        orientation: orientationSchema,
        contentFilter: contentFilterSchema,
        collections: stringArraySchema("The collection identifiers to filter the search results by."),
      },
      ["query"],
      "The input payload for searching photos on Unsplash.",
    ),
    outputSchema: s.actionOutput(
      {
        total: s.number("The total number of matching photo results."),
        totalPages: s.number("The total number of result pages."),
        results: s.array("The matching photo summaries returned by Unsplash.", photoSummarySchema),
      },
      "The photo search results returned by Unsplash.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_photo",
    operationType: "read",
    description: "Fetch the detailed payload for a single Unsplash photo.",
    inputSchema: s.actionInput(
      {
        id: s.nonEmptyString("The Unsplash photo identifier to retrieve."),
      },
      ["id"],
      "The input payload for fetching a single Unsplash photo.",
    ),
    outputSchema: s.actionOutput(
      {
        photo: photoDetailSchema,
      },
      "The detailed photo payload returned by Unsplash.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_random_photo",
    operationType: "read",
    description: "Fetch one or more random Unsplash photos using optional filters.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString("The search query used to constrain the random photo."),
        collections: stringArraySchema("The collection identifiers used to constrain the random photo."),
        topics: stringArraySchema("The topic identifiers used to constrain the random photo."),
        username: s.nonEmptyString("The username used to constrain the random photo."),
        orientation: orientationSchema,
        contentFilter: contentFilterSchema,
        count: s.integer("The number of random photos to request, between 1 and 30.", {
          minimum: 1,
          maximum: 30,
        }),
      },
      [],
      "The input payload for fetching one or more random Unsplash photos.",
    ),
    outputSchema: s.actionOutput(
      {
        photos: s.array("The random photo resources returned by Unsplash.", photoDetailSchema),
      },
      "The normalized random photo payload returned by Unsplash.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_topics",
    operationType: "read",
    description: "List topics curated by Unsplash.",
    inputSchema: s.actionInput(
      {
        page: pageSchema,
        perPage: perPageSchema,
        orderBy: topicOrderBySchema,
      },
      [],
      "The input payload for listing Unsplash topics.",
    ),
    outputSchema: s.actionOutput(
      {
        topics: s.array("The topics returned by Unsplash.", topicSchema),
      },
      "The topic listing returned by Unsplash.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_topic_photos",
    operationType: "read",
    description: "List photos from a specific Unsplash topic.",
    inputSchema: s.actionInput(
      {
        topicIdOrSlug: s.nonEmptyString("The topic identifier or slug to read photos from."),
        page: pageSchema,
        perPage: perPageSchema,
        orientation: orientationSchema,
        orderBy: photoFeedOrderBySchema,
      },
      ["topicIdOrSlug"],
      "The input payload for listing photos from an Unsplash topic.",
    ),
    outputSchema: s.actionOutput(
      {
        photos: s.array("The photo summaries returned for the requested Unsplash topic.", photoSummarySchema),
      },
      "The topic photo listing returned by Unsplash.",
    ),
  }),
];
