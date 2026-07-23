import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "twitter";
const genericTwitterInputSchema = s.looseObject(
  "X API action input. See the action description for provider semantics.",
);
const genericTwitterOutputSchema = s.looseObject("Normalized X API response payload.");
const twitterMediaUploadResultSchema = s.object(
  "The normalized result of a chunked X media upload request.",
  {
    mediaId: s.nonEmptyString("The X media identifier."),
    state: s.stringEnum("The current media processing state.", ["pending", "in_progress", "succeeded", "failed"]),
    expiresAfterSecs: s.number("The number of seconds before the uploaded media expires."),
    size: s.number("The uploaded media size in bytes."),
    progressPercent: s.number("The media processing progress percentage."),
    checkAfterSecs: s.number("The suggested delay before checking the processing status again."),
    mediaKey: s.nonEmptyString("The X media key when returned by the API."),
    processingInfo: s.looseObject("The processing details returned by X."),
    raw: s.looseObject("The raw X API response."),
  },
  {
    optional: ["expiresAfterSecs", "size", "progressPercent", "checkAfterSecs", "mediaKey", "processingInfo"],
  },
);

function action(
  name: TwitterActionName,
  description: string,
  requiredScopes: string[],
  providerPermissions: string[],
  inputSchema: JsonSchema = genericTwitterInputSchema,
  outputSchema: JsonSchema = genericTwitterOutputSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes,
    providerPermissions,
    inputSchema,
    outputSchema,
  });
}

export type TwitterActionName =
  | "user_lookup_me"
  | "user_lookup_by_username"
  | "get_user_by_id"
  | "get_users_by_ids"
  | "user_lookup_by_usernames"
  | "recent_search"
  | "search_recent_counts"
  | "post_lookup_by_post_id"
  | "post_lookup_by_post_ids"
  | "user_home_timeline_by_user_id"
  | "retrieve_posts_that_quote_a_post"
  | "get_post_retweets"
  | "get_space_posts"
  | "bookmarks_by_user"
  | "returns_post_objects_liked_by_the_provided_user_id"
  | "creation_of_a_post"
  | "post_delete_by_post_id"
  | "hide_replies"
  | "upload_media"
  | "upload_large_media"
  | "get_media_upload_status"
  | "followers_by_user_id"
  | "following_by_user_id"
  | "get_post_retweeters_action"
  | "list_post_likers"
  | "get_muted_users"
  | "get_list_followers"
  | "get_list_members"
  | "get_space_ticket_buyers"
  | "follow_user"
  | "unfollow_user"
  | "user_like_post"
  | "unlike_post"
  | "add_post_to_bookmarks"
  | "remove_post_from_bookmarks"
  | "retweet_post"
  | "unretweet_post"
  | "mute_user"
  | "unmute_user"
  | "create_list"
  | "get_list"
  | "get_user_followed_lists"
  | "get_user_list_memberships"
  | "get_user_owned_lists"
  | "get_user_pinned_lists"
  | "list_posts_timeline_by_list_id"
  | "delete_list"
  | "update_list"
  | "add_list_member"
  | "remove_list_member"
  | "follow_list"
  | "unfollow_list"
  | "pin_list"
  | "unpin_list"
  | "search_spaces"
  | "get_space_by_id"
  | "get_spaces_by_ids"
  | "get_spaces_by_creators"
  | "get_recent_dm_events"
  | "get_dm_event"
  | "get_dm_conversation_events"
  | "retrieve_dm_conversation_events"
  | "send_a_new_message_to_a_user"
  | "send_dm_to_conversation"
  | "create_dm_conversation"
  | "delete_dm"
  | "full_archive_search"
  | "search_full_archive_counts"
  | "create_compliance_job"
  | "get_compliance_job"
  | "get_compliance_jobs";

export const twitterActions: ActionDefinition[] = [
  action(
    "user_lookup_me",
    "Get the currently authenticated X user profile and optional expanded objects.",
    ["twitter.users.read", "twitter.tweet.read"],
    ["users.read", "tweet.read"],
  ),
  action(
    "user_lookup_by_username",
    "Get a public X user profile by username and optional expanded objects.",
    ["twitter.users.read"],
    ["users.read"],
  ),
  action(
    "get_user_by_id",
    "Get a public X user profile by user ID and optional expanded objects.",
    ["twitter.users.read"],
    ["users.read"],
  ),
  action(
    "get_users_by_ids",
    "Get up to 100 public X user profiles by user ID and optional expanded objects.",
    ["twitter.users.read"],
    ["users.read"],
  ),
  action(
    "user_lookup_by_usernames",
    "Get up to 100 public X user profiles by username and optional expanded objects.",
    ["twitter.users.read"],
    ["users.read"],
  ),
  action(
    "recent_search",
    "Search recent Tweets from the last seven days using X search syntax.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "search_recent_counts",
    "Count recent Tweets from the last seven days using X search syntax.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "post_lookup_by_post_id",
    "Get a public Tweet by Tweet ID and optional expanded objects.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "post_lookup_by_post_ids",
    "Get up to 100 public Tweets by Tweet ID and optional expanded objects.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "user_home_timeline_by_user_id",
    "Get the reverse chronological home timeline for a user account.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "retrieve_posts_that_quote_a_post",
    "Get Tweets that quote a given Tweet ID.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "get_post_retweets",
    "Get Tweet objects that retweeted a given Tweet ID.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "get_space_posts",
    "Get Tweets that were shared in a given X Space.",
    ["twitter.space.read", "twitter.tweet.read", "twitter.users.read"],
    ["space.read", "tweet.read", "users.read"],
  ),
  action(
    "bookmarks_by_user",
    "Get bookmarked Tweets for a user account.",
    ["twitter.bookmark.read", "twitter.tweet.read", "twitter.users.read"],
    ["bookmark.read", "tweet.read", "users.read"],
  ),
  action(
    "returns_post_objects_liked_by_the_provided_user_id",
    "Get Tweets liked by a user account.",
    ["twitter.like.read", "twitter.tweet.read", "twitter.users.read"],
    ["like.read", "tweet.read", "users.read"],
  ),
  action(
    "creation_of_a_post",
    "Create a Tweet for the authenticated X user.",
    ["twitter.tweet.read", "twitter.tweet.write", "twitter.users.read"],
    ["tweet.read", "tweet.write", "users.read"],
  ),
  action(
    "post_delete_by_post_id",
    "Delete a Tweet authored by the authenticated X user.",
    ["twitter.tweet.read", "twitter.tweet.write", "twitter.users.read"],
    ["tweet.read", "tweet.write", "users.read"],
  ),
  action(
    "hide_replies",
    "Hide or unhide replies for a Tweet authored by the authenticated X user.",
    ["twitter.tweet.read", "twitter.tweet.write", "twitter.users.read"],
    ["tweet.read", "tweet.write", "users.read"],
  ),
  action(
    "upload_media",
    "Upload a single image to X and return the created media identifiers.",
    ["twitter.media.write"],
    ["media.write"],
    s.object(
      "The image bytes and metadata to upload to X.",
      {
        mediaBase64: s.nonEmptyString("The Base64-encoded image bytes."),
        mimeType: s.nonEmptyString("The image MIME type."),
        fileName: s.nonEmptyString("The filename sent to X."),
        mediaCategory: s.nonEmptyString("The X media category when required for the upload."),
      },
      { optional: ["fileName", "mediaCategory"] },
    ),
    s.object(
      "The result of uploading one image to X.",
      {
        id: s.nonEmptyString("The X media identifier."),
        mediaKey: s.nonEmptyString("The X media key when returned by the API."),
        expiresAfterSecs: s.number("The number of seconds before the uploaded media expires."),
        size: s.number("The uploaded image size in bytes."),
        raw: s.looseObject("The raw X API response."),
      },
      { optional: ["mediaKey", "expiresAfterSecs", "size"] },
    ),
  ),
  action(
    "upload_large_media",
    "Upload a video or other large media file to X from a temporary HTTP URL using chunked media upload.",
    ["twitter.media.write"],
    ["media.write"],
    s.object(
      "The remote media source and chunked upload metadata.",
      {
        mediaUrl: s.url("The public HTTP or HTTPS URL to download the media from."),
        mimeType: s.nonEmptyString("The media MIME type."),
        totalBytes: s.integer("The exact number of media bytes available at mediaUrl.", { minimum: 1 }),
        mediaCategory: s.nonEmptyString("The X media category for the upload."),
        chunkSizeBytes: s.integer("The number of bytes uploaded in each chunk.", {
          minimum: 1,
          maximum: 5 * 1024 * 1024,
        }),
      },
      { optional: ["chunkSizeBytes"] },
    ),
    twitterMediaUploadResultSchema,
  ),
  action(
    "get_media_upload_status",
    "Get the processing status for a chunked X media upload.",
    ["twitter.media.write"],
    ["media.write"],
    s.requiredObject("The media upload to inspect.", {
      mediaId: s.nonEmptyString("The X media identifier returned by upload_large_media."),
    }),
    twitterMediaUploadResultSchema,
  ),
  action(
    "followers_by_user_id",
    "Get followers for a user account.",
    ["twitter.follows.read", "twitter.users.read"],
    ["follows.read", "users.read"],
  ),
  action(
    "following_by_user_id",
    "Get followed accounts for a user account.",
    ["twitter.follows.read", "twitter.users.read"],
    ["follows.read", "users.read"],
  ),
  action(
    "get_post_retweeters_action",
    "Get users who retweeted a given Tweet ID.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "list_post_likers",
    "Get users who liked a given Tweet ID.",
    ["twitter.tweet.read", "twitter.users.read"],
    ["tweet.read", "users.read"],
  ),
  action(
    "get_muted_users",
    "Get muted accounts for a user account.",
    ["twitter.mute.read", "twitter.users.read"],
    ["mute.read", "users.read"],
  ),
  action(
    "get_list_followers",
    "Get users who follow a given X List.",
    ["twitter.list.read", "twitter.users.read"],
    ["list.read", "users.read"],
  ),
  action(
    "get_list_members",
    "Get users who are members of a given X List.",
    ["twitter.list.read", "twitter.users.read"],
    ["list.read", "users.read"],
  ),
  action(
    "get_space_ticket_buyers",
    "Get ticket buyers for a ticketed X Space.",
    ["twitter.space.read", "twitter.users.read"],
    ["space.read", "users.read"],
  ),
  action(
    "follow_user",
    "Follow a target user from the authenticated user account.",
    ["twitter.follows.write", "twitter.users.read"],
    ["follows.write", "users.read"],
  ),
  action(
    "unfollow_user",
    "Unfollow a target user from the authenticated user account.",
    ["twitter.follows.write", "twitter.users.read"],
    ["follows.write", "users.read"],
  ),
  action(
    "user_like_post",
    "Like a Tweet from the authenticated user account.",
    ["twitter.like.write", "twitter.tweet.read", "twitter.users.read"],
    ["like.write", "tweet.read", "users.read"],
  ),
  action(
    "unlike_post",
    "Unlike a Tweet from the authenticated user account.",
    ["twitter.like.write", "twitter.tweet.read", "twitter.users.read"],
    ["like.write", "tweet.read", "users.read"],
  ),
  action(
    "add_post_to_bookmarks",
    "Add a Tweet to bookmarks for the authenticated user account.",
    ["twitter.bookmark.write", "twitter.tweet.read", "twitter.users.read"],
    ["bookmark.write", "tweet.read", "users.read"],
  ),
  action(
    "remove_post_from_bookmarks",
    "Remove a Tweet from bookmarks for the authenticated user account.",
    ["twitter.bookmark.write", "twitter.tweet.read", "twitter.users.read"],
    ["bookmark.write", "tweet.read", "users.read"],
  ),
  action(
    "retweet_post",
    "Retweet a Tweet from the authenticated user account.",
    ["twitter.tweet.write", "twitter.tweet.read", "twitter.users.read"],
    ["tweet.write", "tweet.read", "users.read"],
  ),
  action(
    "unretweet_post",
    "Undo a Retweet from the authenticated user account.",
    ["twitter.tweet.write", "twitter.tweet.read", "twitter.users.read"],
    ["tweet.write", "tweet.read", "users.read"],
  ),
  action(
    "mute_user",
    "Mute a target user from the authenticated user account.",
    ["twitter.mute.write", "twitter.users.read"],
    ["mute.write", "users.read"],
  ),
  action(
    "unmute_user",
    "Unmute a target user from the authenticated user account.",
    ["twitter.mute.write", "twitter.users.read"],
    ["mute.write", "users.read"],
  ),
  action(
    "create_list",
    "Create a new X List for the authenticated user account.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "get_list",
    "Get a List by List ID and optional expanded owner objects.",
    ["twitter.list.read", "twitter.users.read"],
    ["list.read", "users.read"],
  ),
  action(
    "get_user_followed_lists",
    "Get Lists followed by a user account.",
    ["twitter.list.read", "twitter.users.read"],
    ["list.read", "users.read"],
  ),
  action(
    "get_user_list_memberships",
    "Get Lists that include a given user as a member.",
    ["twitter.list.read", "twitter.users.read"],
    ["list.read", "users.read"],
  ),
  action(
    "get_user_owned_lists",
    "Get Lists owned by a given user account.",
    ["twitter.list.read", "twitter.users.read"],
    ["list.read", "users.read"],
  ),
  action(
    "get_user_pinned_lists",
    "Get Lists pinned by a given user account.",
    ["twitter.list.read", "twitter.users.read"],
    ["list.read", "users.read"],
  ),
  action(
    "list_posts_timeline_by_list_id",
    "Get Tweets from a given X List timeline.",
    ["twitter.list.read", "twitter.tweet.read", "twitter.users.read"],
    ["list.read", "tweet.read", "users.read"],
  ),
  action(
    "delete_list",
    "Delete a List owned by the authenticated user account.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "update_list",
    "Update List attributes for a List owned by the authenticated user account.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "add_list_member",
    "Add a user account as a member of an X List.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "remove_list_member",
    "Remove a user account from an X List.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "follow_list",
    "Follow an X List from the authenticated user account.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "unfollow_list",
    "Unfollow an X List from the authenticated user account.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "pin_list",
    "Pin an X List for the authenticated user account.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "unpin_list",
    "Unpin an X List for the authenticated user account.",
    ["twitter.list.read", "twitter.list.write", "twitter.users.read"],
    ["list.read", "list.write", "users.read"],
  ),
  action(
    "search_spaces",
    "Search X Spaces by query text and optional Space filters.",
    ["twitter.space.read", "twitter.users.read"],
    ["space.read", "users.read"],
  ),
  action(
    "get_space_by_id",
    "Get a Space by Space ID and optional expanded objects.",
    ["twitter.space.read", "twitter.users.read"],
    ["space.read", "users.read"],
  ),
  action(
    "get_spaces_by_ids",
    "Get up to 100 Spaces by Space ID and optional expanded objects.",
    ["twitter.space.read", "twitter.users.read"],
    ["space.read", "users.read"],
  ),
  action(
    "get_spaces_by_creators",
    "Get Spaces created by up to 100 user accounts.",
    ["twitter.space.read", "twitter.users.read"],
    ["space.read", "users.read"],
  ),
  action(
    "get_recent_dm_events",
    "Get recent Direct Message events for the authenticated user account.",
    ["twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.read", "tweet.read", "users.read"],
  ),
  action(
    "get_dm_event",
    "Get a Direct Message event by event ID and optional expanded objects.",
    ["twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.read", "tweet.read", "users.read"],
  ),
  action(
    "get_dm_conversation_events",
    "Get Direct Message events for a one-to-one conversation with a participant.",
    ["twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.read", "tweet.read", "users.read"],
  ),
  action(
    "retrieve_dm_conversation_events",
    "Get Direct Message events for a Direct Message conversation ID.",
    ["twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.read", "tweet.read", "users.read"],
  ),
  action(
    "send_a_new_message_to_a_user",
    "Send a new Direct Message to a user account.",
    ["twitter.dm.write", "twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.write", "dm.read", "tweet.read", "users.read"],
  ),
  action(
    "send_dm_to_conversation",
    "Send a new Direct Message to an existing conversation.",
    ["twitter.dm.write", "twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.write", "dm.read", "tweet.read", "users.read"],
  ),
  action(
    "create_dm_conversation",
    "Create a new group Direct Message conversation with an initial message.",
    ["twitter.dm.write", "twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.write", "dm.read", "tweet.read", "users.read"],
  ),
  action(
    "delete_dm",
    "Delete a Direct Message event from the authenticated user account.",
    ["twitter.dm.write", "twitter.dm.read", "twitter.tweet.read", "twitter.users.read"],
    ["dm.write", "dm.read", "tweet.read", "users.read"],
  ),
  action("full_archive_search", "Search the full public Tweet archive using app-only auth.", [], ["app_bearer_token"]),
  action(
    "search_full_archive_counts",
    "Count Tweets over the full public archive using app-only auth.",
    [],
    ["app_bearer_token"],
  ),
  action("create_compliance_job", "Create a compliance job using app-only auth.", [], ["app_bearer_token"]),
  action("get_compliance_job", "Get a compliance job by job ID using app-only auth.", [], ["app_bearer_token"]),
  action("get_compliance_jobs", "List compliance jobs using app-only auth.", [], ["app_bearer_token"]),
];
