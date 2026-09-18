import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { youtubeReadScopes, youtubeWriteScopes } from "./scopes.ts";

const service = "youtube";

const rawResource = s.looseObject("The raw YouTube resource.");
const nonEmptyString = (description: string): JsonSchema => s.string(description, { minLength: 1 });
const commaSeparatedIds = (description: string): JsonSchema =>
  s.array(description, nonEmptyString("One YouTube resource ID."), { minItems: 1, maxItems: 50 });
const partList = (description: string): JsonSchema =>
  s.array(description, nonEmptyString("One YouTube API part such as snippet or statistics."), { minItems: 1 });
const maxResults = s.integer("Maximum number of items to return per page.", { minimum: 1, maximum: 50 });
const pageToken = nonEmptyString("Opaque pagination token returned by a previous YouTube API response.");
const privacyStatus = s.stringEnum("The YouTube privacy status.", ["private", "public", "unlisted"]);
const order = s.stringEnum("The order used for search results.", [
  "date",
  "rating",
  "relevance",
  "title",
  "videoCount",
  "viewCount",
]);
const searchType = s.array(
  "Resource types to include in search results.",
  s.stringEnum("One YouTube search result type.", ["channel", "playlist", "video"]),
  { minItems: 1, maxItems: 3 },
);
const safeSearch = s.stringEnum("The safe search setting for YouTube search.", ["moderate", "none", "strict"]);
const textFormat = s.stringEnum("The comment text format returned by YouTube.", ["html", "plainText"]);
const tags = s.array("Tags to attach to the video.", nonEmptyString("One video tag."), { minItems: 1 });
const isoCountryCode = (description: string): JsonSchema => s.string(description, { minLength: 2, maxLength: 2 });
const pageInfo = s.object("Pagination summary returned by YouTube.", {
  totalResults: s.integer("The total result count reported by YouTube."),
  resultsPerPage: s.integer("The number of results included in this page."),
});
const youtubeInputSchemas: Record<YoutubeActionName, JsonSchema> = {
  search: s.object(
    "The input payload for searching YouTube.",
    {
      q: nonEmptyString("The YouTube search query."),
      type: searchType,
      order,
      channelId: nonEmptyString("Only return resources owned by this YouTube channel."),
      publishedAfter: s.dateTime("Only return resources created at or after this timestamp."),
      publishedBefore: s.dateTime("Only return resources created at or before this timestamp."),
      regionCode: isoCountryCode("An ISO 3166-1 alpha-2 region code used to tune search results."),
      relevanceLanguage: isoCountryCode("An ISO 639-1 language code used to tune search results."),
      safeSearch,
      maxResults,
      pageToken,
    },
    {
      optional: [
        "type",
        "order",
        "channelId",
        "publishedAfter",
        "publishedBefore",
        "regionCode",
        "relevanceLanguage",
        "safeSearch",
        "maxResults",
        "pageToken",
      ],
    },
  ),
  list_videos: s.object(
    "The input payload for listing YouTube videos.",
    {
      ids: commaSeparatedIds("The YouTube video IDs to retrieve."),
      chart: s.stringEnum("The chart used when listing videos without explicit IDs.", ["mostPopular"]),
      mine: s.boolean("Whether to list videos owned by the authenticated user."),
      part: partList("The resource parts to include."),
      maxResults,
      pageToken,
      regionCode: isoCountryCode("An ISO 3166-1 alpha-2 region code used with chart requests."),
    },
    { optional: ["ids", "chart", "mine", "part", "maxResults", "pageToken", "regionCode"] },
  ),
  list_channels: s.object(
    "The input payload for listing YouTube channels.",
    {
      ids: commaSeparatedIds("The YouTube channel IDs to retrieve."),
      forHandle: nonEmptyString("A YouTube channel handle such as @GoogleDevelopers."),
      forUsername: nonEmptyString("A legacy YouTube username."),
      mine: s.boolean("Whether to list channels owned by the authenticated user."),
      part: partList("The resource parts to include."),
      maxResults,
      pageToken,
    },
    { optional: ["ids", "forHandle", "forUsername", "mine", "part", "maxResults", "pageToken"] },
  ),
  list_playlists: s.object(
    "The input payload for listing YouTube playlists.",
    {
      ids: commaSeparatedIds("The YouTube playlist IDs to retrieve."),
      channelId: nonEmptyString("The YouTube channel ID whose playlists should be listed."),
      mine: s.boolean("Whether to list playlists owned by the authenticated user."),
      part: partList("The resource parts to include."),
      maxResults,
      pageToken,
    },
    { optional: ["ids", "channelId", "mine", "part", "maxResults", "pageToken"] },
  ),
  list_playlist_items: s.object(
    "The input payload for listing YouTube playlist items.",
    {
      playlistId: nonEmptyString("The YouTube playlist ID to inspect."),
      part: partList("The resource parts to include."),
      maxResults,
      pageToken,
    },
    { optional: ["part", "maxResults", "pageToken"] },
  ),
  create_playlist: s.object(
    "The input payload for creating a YouTube playlist.",
    {
      title: nonEmptyString("The YouTube playlist title."),
      description: s.string("The YouTube playlist description."),
      privacyStatus,
    },
    { optional: ["description", "privacyStatus"] },
  ),
  update_playlist: s.object(
    "The input payload for updating a YouTube playlist.",
    {
      playlistId: nonEmptyString("The YouTube playlist ID to update."),
      title: nonEmptyString("The updated YouTube playlist title."),
      description: s.string("The updated YouTube playlist description."),
      privacyStatus,
    },
    { optional: ["description", "privacyStatus"] },
  ),
  delete_playlist: s.object("The input payload for deleting a YouTube playlist.", {
    playlistId: nonEmptyString("The YouTube playlist ID to delete."),
  }),
  add_video_to_playlist: s.object(
    "The input payload for adding a YouTube video to a playlist.",
    {
      playlistId: nonEmptyString("The YouTube playlist ID to add the video to."),
      videoId: nonEmptyString("The YouTube video ID to add to the playlist."),
      position: s.nonNegativeInteger("The zero-based position for the new playlist item."),
      note: s.string("A user note associated with the playlist item when supported by YouTube."),
    },
    { optional: ["position", "note"] },
  ),
  update_playlist_item: s.object(
    "The input payload for updating a YouTube playlist item.",
    {
      playlistItemId: nonEmptyString("The YouTube playlist item ID to update."),
      playlistId: nonEmptyString("The YouTube playlist ID that contains the item."),
      videoId: nonEmptyString("The YouTube video ID referenced by the playlist item."),
      position: s.nonNegativeInteger("The zero-based position for the playlist item."),
      note: s.string("A user note associated with the playlist item when supported by YouTube."),
    },
    { optional: ["position", "note"] },
  ),
  delete_playlist_item: s.object("The input payload for deleting a YouTube playlist item.", {
    playlistItemId: nonEmptyString("The YouTube playlist item ID to delete."),
  }),
  list_comment_threads: s.object(
    "The input payload for listing YouTube comment threads.",
    {
      videoId: nonEmptyString("The YouTube video ID whose comment threads should be listed."),
      channelId: nonEmptyString("The YouTube channel ID whose comment threads should be listed."),
      ids: commaSeparatedIds("The YouTube comment thread IDs to retrieve."),
      allThreadsRelatedToChannelId: nonEmptyString(
        "The YouTube channel ID used to retrieve all related comment threads.",
      ),
      part: partList("The resource parts to include."),
      maxResults,
      pageToken,
      order: s.stringEnum("The order used for comment thread results.", ["time", "relevance"]),
      textFormat,
    },
    {
      optional: [
        "videoId",
        "channelId",
        "ids",
        "allThreadsRelatedToChannelId",
        "part",
        "maxResults",
        "pageToken",
        "order",
        "textFormat",
      ],
    },
  ),
  list_comments: s.object(
    "The input payload for listing YouTube comments.",
    {
      parentId: nonEmptyString("The YouTube parent comment ID whose replies should be listed."),
      ids: commaSeparatedIds("The YouTube comment IDs to retrieve."),
      part: partList("The resource parts to include."),
      maxResults,
      pageToken,
      textFormat,
    },
    { optional: ["parentId", "ids", "part", "maxResults", "pageToken", "textFormat"] },
  ),
  post_comment: s.object("The input payload for posting a YouTube comment.", {
    videoId: nonEmptyString("The YouTube video ID to comment on."),
    channelId: nonEmptyString("The channel ID for the video being commented on."),
    textOriginal: nonEmptyString("The plain-text comment content to post."),
  }),
  create_comment_reply: s.object("The input payload for replying to a YouTube comment.", {
    parentId: nonEmptyString("The parent YouTube comment ID to reply to."),
    textOriginal: nonEmptyString("The plain-text reply content to post."),
  }),
  upload_video_from_url: s.object(
    "The input payload for uploading a YouTube video from a URL.",
    {
      mediaUrl: s.url("The HTTPS URL of the video file to upload."),
      title: nonEmptyString("The YouTube video title."),
      description: s.string("The YouTube video description."),
      privacyStatus,
      tags,
      categoryId: nonEmptyString("The YouTube video category ID."),
      fileName: nonEmptyString("The filename sent to YouTube for the uploaded media."),
      mimeType: nonEmptyString("The MIME type of the video media."),
      notifySubscribers: s.boolean("Whether YouTube should notify subscribers."),
    },
    {
      optional: ["description", "privacyStatus", "tags", "categoryId", "fileName", "mimeType", "notifySubscribers"],
    },
  ),
  update_video: s.object(
    "The input payload for updating a YouTube video.",
    {
      videoId: nonEmptyString("The YouTube video ID to update."),
      title: nonEmptyString("The updated YouTube video title."),
      description: s.string("The updated YouTube video description."),
      tags,
      categoryId: nonEmptyString("The updated YouTube video category ID."),
      privacyStatus,
    },
    { optional: ["description", "tags", "categoryId", "privacyStatus"] },
  ),
  delete_video: s.object("The input payload for deleting a YouTube video.", {
    videoId: nonEmptyString("The YouTube video ID to delete."),
  }),
  get_video_rating: s.object("The input payload for retrieving YouTube video ratings.", {
    ids: commaSeparatedIds("The YouTube video IDs whose ratings should be retrieved."),
  }),
  rate_video: s.object("The input payload for rating a YouTube video.", {
    videoId: nonEmptyString("The YouTube video ID to rate."),
    rating: s.stringEnum("The rating to apply to the video.", ["like", "dislike", "none"]),
  }),
  set_thumbnail_from_url: s.object(
    "The input payload for setting a YouTube video thumbnail from a URL.",
    {
      videoId: nonEmptyString("The YouTube video ID whose thumbnail should be replaced."),
      imageUrl: s.url("The HTTPS URL of the thumbnail image to upload."),
      fileName: nonEmptyString("The filename sent to YouTube for the thumbnail media."),
      mimeType: nonEmptyString("The MIME type of the thumbnail image."),
    },
    { optional: ["fileName", "mimeType"] },
  ),
  download_caption: s.object(
    "The input payload for downloading a YouTube caption track.",
    {
      captionId: nonEmptyString("The YouTube caption track ID to download."),
      tfmt: nonEmptyString("The caption output format requested from YouTube, such as srt or vtt."),
      tlang: nonEmptyString("The caption language to translate into when supported by YouTube."),
      fileName: nonEmptyString("The output filename used for the transit file."),
      mimeType: nonEmptyString("The MIME type to report for the downloaded caption file."),
    },
    { optional: ["tfmt", "tlang", "fileName", "mimeType"] },
  ),
  list_caption_tracks: s.object(
    "The input payload for listing YouTube caption tracks.",
    {
      videoId: nonEmptyString("The YouTube video ID whose caption tracks should be listed."),
      ids: commaSeparatedIds("The YouTube caption track IDs to retrieve."),
      part: partList("The resource parts to include."),
    },
    { optional: ["videoId", "ids", "part"] },
  ),
  upload_caption_from_url: s.object(
    "The input payload for uploading a YouTube caption track from a URL.",
    {
      captionUrl: s.url("The HTTPS URL of the caption file to upload."),
      videoId: nonEmptyString("The YouTube video ID to attach the caption track to."),
      language: nonEmptyString("The caption track language, such as en or zh-Hans."),
      name: nonEmptyString("The caption track display name."),
      isDraft: s.boolean("Whether the uploaded caption track should be a draft."),
      fileName: nonEmptyString("The filename sent to YouTube for the caption media."),
      mimeType: nonEmptyString("The MIME type of the caption file."),
    },
    { optional: ["name", "isDraft", "fileName", "mimeType"] },
  ),
  update_caption: s.object(
    "The input payload for updating a YouTube caption track.",
    {
      captionId: nonEmptyString("The YouTube caption track ID to update."),
      name: nonEmptyString("The updated caption track display name."),
      isDraft: s.boolean("Whether the caption track should be a draft."),
    },
    { optional: ["name", "isDraft"] },
  ),
  delete_caption: s.object("The input payload for deleting a YouTube caption track.", {
    captionId: nonEmptyString("The YouTube caption track ID to delete."),
  }),
  list_video_categories: s.object(
    "The input payload for listing YouTube video categories.",
    {
      regionCode: isoCountryCode("An ISO 3166-1 alpha-2 region code."),
      ids: commaSeparatedIds("The YouTube video category IDs to retrieve."),
      part: partList("The resource parts to include."),
    },
    { optional: ["regionCode", "ids", "part"] },
  ),
  list_i18n_languages: s.object(
    "The input payload for listing YouTube interface languages.",
    {
      hl: nonEmptyString("The language used for localized snippet text."),
      part: partList("The resource parts to include."),
    },
    { optional: ["hl", "part"] },
  ),
  list_i18n_regions: s.object(
    "The input payload for listing YouTube content regions.",
    {
      hl: nonEmptyString("The language used for localized snippet text."),
      part: partList("The resource parts to include."),
    },
    { optional: ["hl", "part"] },
  ),
};
const collectionPage = (key: string, description: string, itemDescription: string) =>
  s.object(description, {
    [key]: s.array(itemDescription, rawResource),
    nextPageToken: s.nullableString("The token for the next result page."),
    prevPageToken: s.nullableString("The token for the previous result page."),
    pageInfo,
  });
const singleResource = (key: string, description: string) => s.object(description, { [key]: rawResource });
const deletionOutput = s.object("A YouTube deletion acknowledgement wrapper.", {
  result: s.object("A YouTube deletion acknowledgement.", {
    id: s.string("The YouTube resource ID that was deleted."),
    deleted: s.boolean("Whether the delete request completed successfully."),
  }),
});

export type YoutubeActionName =
  | "search"
  | "list_videos"
  | "list_channels"
  | "list_playlists"
  | "list_playlist_items"
  | "create_playlist"
  | "update_playlist"
  | "delete_playlist"
  | "add_video_to_playlist"
  | "update_playlist_item"
  | "delete_playlist_item"
  | "list_comment_threads"
  | "list_comments"
  | "post_comment"
  | "create_comment_reply"
  | "upload_video_from_url"
  | "update_video"
  | "delete_video"
  | "get_video_rating"
  | "rate_video"
  | "set_thumbnail_from_url"
  | "download_caption"
  | "list_caption_tracks"
  | "upload_caption_from_url"
  | "update_caption"
  | "delete_caption"
  | "list_video_categories"
  | "list_i18n_languages"
  | "list_i18n_regions";

const actionSpecs: Array<{
  name: YoutubeActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: ReturnType<typeof s.object>;
}> = [
  {
    name: "search",
    operationType: "read",
    description: "Search YouTube for videos, channels, or playlists.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.search,
    outputSchema: collectionPage(
      "results",
      "The response returned when searching YouTube.",
      "The search results returned by YouTube.",
    ),
  },
  {
    name: "list_videos",
    operationType: "read",
    description: "List YouTube video resources by ID or chart.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_videos,
    outputSchema: collectionPage(
      "videos",
      "The response returned when listing YouTube videos.",
      "The videos returned by YouTube.",
    ),
  },
  {
    name: "list_channels",
    operationType: "read",
    description: "List YouTube channel resources by ID, username, handle, or authenticated owner.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_channels,
    outputSchema: collectionPage(
      "channels",
      "The response returned when listing YouTube channels.",
      "The channels returned by YouTube.",
    ),
  },
  {
    name: "list_playlists",
    operationType: "read",
    description: "List YouTube playlists by ID, channel, or authenticated owner.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_playlists,
    outputSchema: collectionPage(
      "playlists",
      "The response returned when listing YouTube playlists.",
      "The playlists returned by YouTube.",
    ),
  },
  {
    name: "list_playlist_items",
    operationType: "read",
    description: "List videos and resources contained in a YouTube playlist.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_playlist_items,
    outputSchema: collectionPage(
      "playlistItems",
      "The response returned when listing YouTube playlist items.",
      "The playlist items returned by YouTube.",
    ),
  },
  {
    name: "create_playlist",
    operationType: "write",
    description: "Create a YouTube playlist owned by the authenticated user.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.create_playlist,
    outputSchema: singleResource("playlist", "The response returned after creating a YouTube playlist."),
  },
  {
    name: "update_playlist",
    operationType: "write",
    description: "Update a YouTube playlist's snippet and status metadata.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.update_playlist,
    outputSchema: singleResource("playlist", "The response returned after updating a YouTube playlist."),
  },
  {
    name: "delete_playlist",
    operationType: "destructive",
    description: "Delete a YouTube playlist owned by the authenticated user.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.delete_playlist,
    outputSchema: deletionOutput,
  },
  {
    name: "add_video_to_playlist",
    operationType: "write",
    description: "Add a YouTube video to a playlist.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.add_video_to_playlist,
    outputSchema: singleResource("playlistItem", "The response returned after adding a video to a YouTube playlist."),
  },
  {
    name: "update_playlist_item",
    operationType: "write",
    description: "Update a YouTube playlist item's position or note.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.update_playlist_item,
    outputSchema: singleResource("playlistItem", "The response returned after updating a YouTube playlist item."),
  },
  {
    name: "delete_playlist_item",
    operationType: "destructive",
    description: "Delete an item from a YouTube playlist.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.delete_playlist_item,
    outputSchema: deletionOutput,
  },
  {
    name: "list_comment_threads",
    operationType: "read",
    description: "List top-level YouTube comment threads for a video, channel, or thread IDs.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_comment_threads,
    outputSchema: collectionPage(
      "commentThreads",
      "The response returned when listing YouTube comment threads.",
      "The comment threads returned by YouTube.",
    ),
  },
  {
    name: "list_comments",
    operationType: "read",
    description: "List YouTube comments by parent comment ID or comment IDs.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_comments,
    outputSchema: collectionPage(
      "comments",
      "The response returned when listing YouTube comments.",
      "The comments returned by YouTube.",
    ),
  },
  {
    name: "post_comment",
    operationType: "write",
    description: "Post a top-level public comment on a YouTube video.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.post_comment,
    outputSchema: singleResource("commentThread", "The response returned after posting a YouTube comment."),
  },
  {
    name: "create_comment_reply",
    operationType: "write",
    description: "Reply to an existing YouTube comment thread.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.create_comment_reply,
    outputSchema: singleResource("comment", "The response returned after replying to a YouTube comment."),
  },
  {
    name: "upload_video_from_url",
    operationType: "write",
    description: "Upload a YouTube video from an HTTPS media URL using the resumable upload API.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.upload_video_from_url,
    outputSchema: singleResource("video", "The response returned after uploading a YouTube video."),
  },
  {
    name: "update_video",
    operationType: "write",
    description: "Update a YouTube video's snippet and status metadata.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.update_video,
    outputSchema: singleResource("video", "The response returned after updating a YouTube video."),
  },
  {
    name: "delete_video",
    operationType: "destructive",
    description: "Delete a YouTube video owned by the authenticated user.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.delete_video,
    outputSchema: deletionOutput,
  },
  {
    name: "get_video_rating",
    operationType: "read",
    description: "Get the authenticated user's rating for one or more YouTube videos.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.get_video_rating,
    outputSchema: s.object("The response returned when retrieving YouTube video ratings.", {
      ratings: s.array("The video ratings returned by YouTube.", rawResource),
    }),
  },
  {
    name: "rate_video",
    operationType: "destructive",
    description: "Set or clear the authenticated user's rating for a YouTube video.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.rate_video,
    outputSchema: s.object("The response returned after rating a YouTube video.", {
      videoId: s.string("The YouTube video ID that was rated."),
      rating: s.string("The rating that was applied."),
      success: s.boolean("Whether YouTube accepted the rating request."),
    }),
  },
  {
    name: "set_thumbnail_from_url",
    operationType: "write",
    description: "Upload and set a custom YouTube video thumbnail from an HTTPS image URL.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.set_thumbnail_from_url,
    outputSchema: singleResource("thumbnails", "The response returned after setting a YouTube thumbnail."),
  },
  {
    name: "download_caption",
    operationType: "read",
    description: "Download a YouTube caption track and return a temporary transit URL.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.download_caption,
    outputSchema: s.object("The response returned after downloading a YouTube caption track.", {
      file: s.looseObject("A file downloaded through the connector transit file service."),
    }),
  },
  {
    name: "list_caption_tracks",
    operationType: "read",
    description: "List YouTube caption tracks for a video or caption track IDs.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_caption_tracks,
    outputSchema: s.object("The response returned when listing YouTube caption tracks.", {
      captions: s.array("The caption tracks returned by YouTube.", rawResource),
    }),
  },
  {
    name: "upload_caption_from_url",
    operationType: "write",
    description: "Upload a YouTube caption track from an HTTPS caption file URL.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.upload_caption_from_url,
    outputSchema: singleResource("caption", "The response returned after uploading a YouTube caption track."),
  },
  {
    name: "update_caption",
    operationType: "write",
    description: "Update a YouTube caption track's metadata.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.update_caption,
    outputSchema: singleResource("caption", "The response returned after updating a YouTube caption track."),
  },
  {
    name: "delete_caption",
    operationType: "destructive",
    description: "Delete a YouTube caption track.",
    requiredScopes: youtubeWriteScopes,
    inputSchema: youtubeInputSchemas.delete_caption,
    outputSchema: deletionOutput,
  },
  {
    name: "list_video_categories",
    operationType: "read",
    description: "List YouTube video categories for a region or category IDs.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_video_categories,
    outputSchema: s.object("The response returned when listing YouTube video categories.", {
      categories: s.array("The video categories returned by YouTube.", rawResource),
    }),
  },
  {
    name: "list_i18n_languages",
    operationType: "read",
    description: "List YouTube interface languages.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_i18n_languages,
    outputSchema: s.object("The response returned when listing YouTube interface languages.", {
      languages: s.array("The i18n languages returned by YouTube.", rawResource),
    }),
  },
  {
    name: "list_i18n_regions",
    operationType: "read",
    description: "List YouTube content regions.",
    requiredScopes: youtubeReadScopes,
    inputSchema: youtubeInputSchemas.list_i18n_regions,
    outputSchema: s.object("The response returned when listing YouTube content regions.", {
      regions: s.array("The i18n regions returned by YouTube.", rawResource),
    }),
  },
];

export const youtubeActions: ActionDefinition[] = actionSpecs.map((action) =>
  defineProviderAction(service, {
    ...action,
  }),
);
