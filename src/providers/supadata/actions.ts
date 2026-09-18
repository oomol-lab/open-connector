import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "supadata";

const urlSchema = s.string({ description: "The URL to process with Supadata.", format: "uri", minLength: 1 });
const youtubeIdSchema = s.nonWhitespaceString(
  "The YouTube URL, handle, playlist ID, channel ID, video ID, or supported identifier.",
);
const limitSchema = s.number("Maximum number of items to return.", { minimum: 1, maximum: 5000 });
const languageSchema = s.nonWhitespaceString("Preferred ISO 639-1 language code.");
const stringArraySchema = (description: string) =>
  s.array(description, s.string("One string value returned by Supadata."));

const looseYoutubeItemSchema = s.looseObject("Metadata returned by Supadata.");
const videoIdsSchema = s.object("The video IDs returned by Supadata.", {
  videoIds: stringArraySchema("Standard video IDs."),
  shortIds: stringArraySchema("YouTube Shorts video IDs."),
  liveIds: stringArraySchema("Live video IDs."),
});
const transcriptChunkSchema = s.looseObject("A timed transcript segment.");
const transcriptSchema = s.object("The YouTube transcript returned by Supadata.", {
  content: s.anyOf("The transcript content as plain text or timed chunks.", [
    s.string("Plain transcript text."),
    s.array("Timed transcript chunks.", transcriptChunkSchema),
  ]),
  lang: s.string("The language code of the returned transcript."),
  availableLangs: stringArraySchema("Available transcript language codes."),
});
const searchResultSchema = s.looseObject("One YouTube search result.");
const youtubeSearchSchema = s.object(
  "The YouTube search response returned by Supadata.",
  {
    query: s.string("The search query that Supadata executed."),
    results: s.array("The YouTube search results.", searchResultSchema),
    totalResults: s.number("Estimated total result count."),
    nextPageToken: s.string("Token for fetching the next result page."),
  },
  { optional: ["totalResults", "nextPageToken"] },
);
const webScrapeSchema = s.looseObject("The scraped web page returned by Supadata.");
const webMapSchema = s.object("The web link map returned by Supadata.", {
  urls: stringArraySchema("URLs found on the website."),
});

export const supadataActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Retrieve Supadata organization, plan, and credit usage details.",
    inputSchema: s.object("The input payload for retrieving Supadata account information.", {}),
    outputSchema: s.object("The Supadata account information response.", {
      organizationId: s.string("The Supadata organization ID."),
      plan: s.string("The subscription plan name."),
      maxCredits: s.number("The maximum credits for the current billing period."),
      usedCredits: s.number("The used credits for the current billing period."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_youtube",
    operationType: "read",
    description: "Search YouTube videos, channels, and playlists through Supadata.",
    inputSchema: s.object(
      "The input payload for searching YouTube.",
      {
        query: s.nonWhitespaceString("The YouTube search query."),
        uploadDate: s.stringEnum("Filter by upload date.", ["all", "hour", "today", "week", "month", "year"]),
        type: s.stringEnum("Filter by result type.", ["all", "video", "channel", "playlist", "movie"]),
        duration: s.stringEnum("Filter by video duration.", ["all", "short", "medium", "long"]),
        sortBy: s.stringEnum("The search result sort order.", ["relevance", "rating", "date", "views"]),
        features: s.array(
          "Special video features to filter by.",
          s.stringEnum("One YouTube feature filter.", [
            "hd",
            "subtitles",
            "creative-commons",
            "3d",
            "live",
            "4k",
            "360",
            "location",
            "hdr",
            "vr180",
          ]),
          { minItems: 1 },
        ),
        limit: limitSchema,
        nextPageToken: s.nonWhitespaceString("Token for fetching the next search results page."),
      },
      { optional: ["uploadDate", "type", "duration", "sortBy", "features", "limit", "nextPageToken"] },
    ),
    outputSchema: youtubeSearchSchema,
  }),
  defineProviderAction(service, {
    name: "get_youtube_video",
    operationType: "read",
    description: "Get metadata for a YouTube video by URL or ID.",
    inputSchema: s.object("The input payload for getting YouTube video metadata.", { id: youtubeIdSchema }),
    outputSchema: looseYoutubeItemSchema,
  }),
  defineProviderAction(service, {
    name: "get_youtube_channel",
    operationType: "read",
    description: "Get metadata for a YouTube channel by URL, handle, or ID.",
    inputSchema: s.object("The input payload for getting YouTube channel metadata.", { id: youtubeIdSchema }),
    outputSchema: looseYoutubeItemSchema,
  }),
  defineProviderAction(service, {
    name: "list_youtube_channel_videos",
    operationType: "read",
    description: "List video IDs from a YouTube channel.",
    inputSchema: s.object(
      "The input payload for listing YouTube channel video IDs.",
      {
        id: youtubeIdSchema,
        limit: limitSchema,
        type: s.stringEnum("The type of channel videos to return.", ["all", "video", "short", "live"]),
      },
      { optional: ["limit", "type"] },
    ),
    outputSchema: videoIdsSchema,
  }),
  defineProviderAction(service, {
    name: "get_youtube_playlist",
    operationType: "read",
    description: "Get metadata for a YouTube playlist by URL or ID.",
    inputSchema: s.object("The input payload for getting YouTube playlist metadata.", { id: youtubeIdSchema }),
    outputSchema: looseYoutubeItemSchema,
  }),
  defineProviderAction(service, {
    name: "list_youtube_playlist_videos",
    operationType: "read",
    description: "List video IDs from a YouTube playlist.",
    inputSchema: s.object(
      "The input payload for listing YouTube playlist video IDs.",
      {
        id: youtubeIdSchema,
        limit: limitSchema,
      },
      { optional: ["limit"] },
    ),
    outputSchema: videoIdsSchema,
  }),
  defineProviderAction(service, {
    name: "get_youtube_transcript",
    operationType: "read",
    description: "Get a YouTube transcript by video URL or ID.",
    inputSchema: s.oneOf(
      [
        s.object(
          "Transcript lookup by URL.",
          {
            url: s.string({ description: "The YouTube video URL.", format: "uri", minLength: 1 }),
            text: s.boolean("Whether Supadata should return plain text transcript content."),
            chunkSize: s.number("Maximum characters per transcript chunk when text is false.", {
              minimum: 50,
              maximum: 10000,
            }),
            lang: languageSchema,
          },
          { optional: ["text", "chunkSize", "lang"] },
        ),
        s.object(
          "Transcript lookup by video ID.",
          {
            videoId: s.nonWhitespaceString("The YouTube video ID. Alternative to url."),
            text: s.boolean("Whether Supadata should return plain text transcript content."),
            chunkSize: s.number("Maximum characters per transcript chunk when text is false.", {
              minimum: 50,
              maximum: 10000,
            }),
            lang: languageSchema,
          },
          { optional: ["text", "chunkSize", "lang"] },
        ),
      ],
      { description: "Provide exactly one of url or videoId." },
    ),
    outputSchema: transcriptSchema,
  }),
  defineProviderAction(service, {
    name: "scrape_web_page",
    operationType: "read",
    description: "Extract Markdown content from a web page.",
    inputSchema: s.object(
      "The input payload for scraping a web page.",
      {
        url: urlSchema,
        noLinks: s.boolean("Whether to remove Markdown links from the extracted content."),
        lang: languageSchema,
      },
      { optional: ["noLinks", "lang"] },
    ),
    outputSchema: webScrapeSchema,
  }),
  defineProviderAction(service, {
    name: "map_web_links",
    operationType: "read",
    description: "Extract links found on a website.",
    inputSchema: s.object(
      "The input payload for mapping website links.",
      {
        url: urlSchema,
        noLinks: s.boolean("Whether to remove Markdown links from scraped source content."),
        lang: languageSchema,
      },
      { optional: ["noLinks", "lang"] },
    ),
    outputSchema: webMapSchema,
  }),
];
