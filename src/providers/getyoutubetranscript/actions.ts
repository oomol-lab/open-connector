import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "getyoutubetranscript";

const continuationSchema = s.nullableString(
  "Opaque token for the next page, or null when there are no more pages. Pass it back unchanged.",
);
const continuationInputSchema = s.nonWhitespaceString(
  "The continuationToken from a previous response, to fetch the next page.",
);
const segmentSchema = s.object("One caption line.", {
  start: s.number("Start time in seconds."),
  duration: s.number("Duration in seconds."),
  text: s.string("Caption text."),
});
const transcriptSchema = s.object(
  "The YouTube transcript and video details.",
  {
    video_id: s.string("The 11-character YouTube video ID."),
    language_code: s.string("Language code of the returned captions."),
    title: s.string("Video title."),
    author_name: s.string("Channel name."),
    author_url: s.string("Channel URL."),
    thumbnail_url: s.string("Video thumbnail URL."),
    transcript: s.string("The full transcript as plain text."),
    word_count: s.number("Number of words in the transcript."),
    segments: s.array("One entry per caption line. Present only when timestamps is true.", segmentSchema),
  },
  { optional: ["segments"] },
);
const looseItemSchema = (description: string) => s.looseObject(description);

export const getyoutubetranscriptActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credits",
    operationType: "read",
    description: "Check the remaining GetYouTubeTranscript credits, plan, and rate limit. Free.",
    inputSchema: s.object("The input payload for checking credits.", {}),
    outputSchema: s.object(
      "The credit balance for the API key.",
      {
        plan_credits_left: s.number("Credits left in the current plan period."),
        topup_credits_left: s.number("Credits left from one-time top-ups."),
        plan: s.string("The plan name."),
        rate_limit_per_minute: s.number("Requests allowed per minute."),
      },
      { optional: ["topup_credits_left", "plan", "rate_limit_per_minute"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_youtube_transcript",
    operationType: "read",
    description:
      "Get the transcript of a YouTube video by URL or ID, with title and channel. Set timestamps to also get per-line timing.",
    inputSchema: s.object(
      "The input payload for getting a YouTube transcript.",
      {
        video: s.nonWhitespaceString(
          "YouTube video URL (watch, youtu.be, Shorts or live) or the 11-character video ID.",
        ),
        language: s.nonWhitespaceString("Caption language code, for example en or es."),
        timestamps: s.boolean("Whether to also return one segment per caption line with start and duration."),
      },
      { optional: ["language", "timestamps"] },
    ),
    outputSchema: transcriptSchema,
  }),
  defineProviderAction(service, {
    name: "search_youtube",
    operationType: "read",
    description: "Search YouTube for videos or channels, one page at a time.",
    inputSchema: s.requireAnyProperty(
      s.object(
        "The input payload for searching YouTube. Give query for a first page or pageToken for later pages.",
        {
          query: s.nonWhitespaceString("The YouTube search query."),
          type: s.stringEnum("The kind of results to return.", ["video", "channel"]),
          pageToken: continuationInputSchema,
        },
        { optional: ["query", "type", "pageToken"] },
      ),
      ["query", "pageToken"],
    ),
    outputSchema: s.looseObject("The YouTube search results.", {
      query: s.string("The search query."),
      video_results: s.array("Video results when type is video.", looseItemSchema("One video result.")),
      channel_results: s.array("Channel results when type is channel.", looseItemSchema("One channel result.")),
      continuation_token: continuationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_youtube_channel_videos",
    operationType: "read",
    description: "List a YouTube channel's videos, newest first, one page at a time.",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "The input payload for listing channel videos. Give channel for the first page or continuation for later pages.",
        {
          channel: s.nonWhitespaceString("Channel @handle, channel URL, or channel ID (UC...)."),
          continuation: continuationInputSchema,
        },
        { optional: ["channel", "continuation"] },
      ),
      ["channel", "continuation"],
    ),
    outputSchema: s.looseObject("One page of channel videos.", {
      videos: s.array("The channel's videos on this page.", looseItemSchema("One video.")),
      has_more: s.boolean("Whether more pages exist."),
      continuation_token: continuationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_youtube_playlist",
    operationType: "read",
    description: "List the videos in a YouTube playlist, one page at a time.",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "The input payload for listing playlist videos. Give list for the first page or continuation for later pages.",
        {
          list: s.nonWhitespaceString("Playlist URL or playlist ID (PL...)."),
          continuation: continuationInputSchema,
        },
        { optional: ["list", "continuation"] },
      ),
      ["list", "continuation"],
    ),
    outputSchema: s.looseObject("One page of playlist videos.", {
      playlist_id: s.string("The playlist ID."),
      title: s.string("The playlist title."),
      videos: s.array("The playlist's videos on this page.", looseItemSchema("One video.")),
      has_more: s.boolean("Whether more pages exist."),
      continuation_token: continuationSchema,
    }),
  }),
];
