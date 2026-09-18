import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pexels";
const page = s.integer("Page number to return.", { minimum: 1 });
const perPage = s.integer("Number of results per page.", { minimum: 1, maximum: 80 });
const photo = s.looseObject("A normalized Pexels photo resource.");
const video = s.looseObject("A normalized Pexels video resource.");
const collection = s.looseObject("A Pexels collection.");
const photoList = s.object(
  "A paginated Pexels photo listing response.",
  {
    url: s.string("The Pexels URL representing the current photo result page."),
    page: s.integer("The current page number returned by Pexels."),
    perPage: s.integer("The number of photos returned per page."),
    totalResults: s.integer("The total number of matching photos."),
    photos: s.array("The photo resources returned by the request.", photo),
    nextPage: s.string("The URL for the next page of photos."),
    prevPage: s.string("The URL for the previous page of photos."),
  },
  { optional: ["nextPage", "prevPage"] },
);
const videoList = s.object(
  "A paginated Pexels video listing response.",
  {
    url: s.string("The Pexels URL representing the current video result page."),
    page: s.integer("The current page number returned by Pexels."),
    perPage: s.integer("The number of videos returned per page."),
    totalResults: s.integer("The total number of matching videos."),
    videos: s.array("The video resources returned by the request.", video),
    nextPage: s.string("The URL for the next page of videos."),
    prevPage: s.string("The URL for the previous page of videos."),
  },
  { optional: ["nextPage", "prevPage"] },
);
const collectionList = s.object(
  "A paginated Pexels collection response.",
  {
    page,
    perPage,
    totalResults: s.integer("The total number of matching collections."),
    collections: s.array("Collections returned by Pexels.", collection),
    nextPage: s.string("The URL for the next page of collections."),
    prevPage: s.string("The URL for the previous page of collections."),
  },
  { optional: ["nextPage", "prevPage"] },
);
const mediaList = s.object(
  "A paginated Pexels collection media response.",
  {
    id: s.string("The unique identifier of the collection returned by Pexels."),
    page,
    perPage,
    totalResults: s.integer("The total number of matching media items."),
    media: s.array(
      "The mixed photo and video items returned by the collection.",
      s.looseObject("A photo or video item returned by the collection media API."),
    ),
    nextPage: s.string("The URL for the next page of media items."),
    prevPage: s.string("The URL for the previous page of media items."),
  },
  { optional: ["nextPage", "prevPage"] },
);

export const pexelsActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_photos",
    operationType: "read",
    description:
      "Search Pexels photos by query with optional orientation, size, color, locale, and pagination filters.",
    inputSchema: s.object(
      "Input parameters for searching photos on Pexels.",
      {
        query: s.nonEmptyString("The search query used to find matching photos on Pexels."),
        orientation: s.stringEnum("Photo orientation filter.", ["landscape", "portrait", "square"]),
        size: s.stringEnum("Photo size filter.", ["large", "medium", "small"]),
        color: s.nonEmptyString("The color filter to apply, such as a named color or hexadecimal code."),
        locale: s.nonEmptyString("The locale to use for the photo search, such as en-US or pt-BR."),
        page,
        perPage,
      },
      { optional: ["orientation", "size", "color", "locale", "page", "perPage"] },
    ),
    outputSchema: photoList,
  }),
  defineProviderAction(service, {
    name: "curated_photos",
    operationType: "read",
    description: "Retrieve the current curated photo feed from Pexels with pagination controls.",
    inputSchema: s.object(
      "Input parameters for retrieving curated photos from Pexels.",
      { page, perPage },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: photoList,
  }),
  defineProviderAction(service, {
    name: "get_photo",
    operationType: "read",
    description: "Retrieve the full metadata for a single Pexels photo by photo id.",
    inputSchema: s.object("Input parameters for retrieving a single Pexels photo.", {
      photoId: s.integer("The unique identifier of the photo to retrieve.", { minimum: 1 }),
    }),
    outputSchema: photo,
  }),
  defineProviderAction(service, {
    name: "featured_collections",
    operationType: "read",
    description: "Retrieve featured Pexels collections with pagination controls.",
    inputSchema: s.object(
      "Input parameters for retrieving featured Pexels collections.",
      { page, perPage },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: collectionList,
  }),
  defineProviderAction(service, {
    name: "my_collections",
    operationType: "read",
    description: "Retrieve collections owned by the authenticated Pexels account.",
    inputSchema: s.object(
      "Input parameters for retrieving authenticated Pexels collections.",
      { page, perPage },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: collectionList,
  }),
  defineProviderAction(service, {
    name: "collection_media",
    operationType: "read",
    description: "Retrieve photos and videos from a Pexels collection with pagination, type, and sort controls.",
    inputSchema: s.object(
      "Input parameters for retrieving media in a Pexels collection.",
      {
        collectionId: s.nonEmptyString("The Pexels collection identifier."),
        page,
        perPage,
        type: s.stringEnum("Media type filter.", ["photos", "videos"]),
        sort: s.stringEnum("Collection media sort order.", ["asc", "desc"]),
      },
      { optional: ["page", "perPage", "type", "sort"] },
    ),
    outputSchema: mediaList,
  }),
  defineProviderAction(service, {
    name: "search_videos",
    operationType: "read",
    description: "Search Pexels videos by query with optional orientation, size, locale, and pagination filters.",
    inputSchema: s.object(
      "Input parameters for searching videos on Pexels.",
      {
        query: s.nonEmptyString("The search query used to find matching videos on Pexels."),
        orientation: s.stringEnum("Video orientation filter.", ["landscape", "portrait", "square"]),
        size: s.stringEnum("Video size filter.", ["large", "medium", "small"]),
        locale: s.nonEmptyString("The locale to use for the video search, such as en-US or pt-BR."),
        page,
        perPage,
      },
      { optional: ["orientation", "size", "locale", "page", "perPage"] },
    ),
    outputSchema: videoList,
  }),
  defineProviderAction(service, {
    name: "popular_videos",
    operationType: "read",
    description: "Retrieve popular Pexels videos with optional dimension, duration, and pagination filters.",
    inputSchema: s.object(
      "Input parameters for retrieving popular Pexels videos.",
      {
        page,
        perPage,
        minWidth: s.integer("Minimum video width in pixels.", { minimum: 1 }),
        minHeight: s.integer("Minimum video height in pixels.", { minimum: 1 }),
        minDuration: s.integer("Minimum video duration in seconds.", { minimum: 1 }),
        maxDuration: s.integer("Maximum video duration in seconds.", { minimum: 1 }),
      },
      { optional: ["page", "perPage", "minWidth", "minHeight", "minDuration", "maxDuration"] },
    ),
    outputSchema: videoList,
  }),
  defineProviderAction(service, {
    name: "get_video",
    operationType: "read",
    description: "Retrieve the full metadata for a single Pexels video by video id.",
    inputSchema: s.object("Input parameters for retrieving a single Pexels video.", {
      videoId: s.integer("The unique identifier of the video to retrieve.", { minimum: 1 }),
    }),
    outputSchema: video,
  }),
];
