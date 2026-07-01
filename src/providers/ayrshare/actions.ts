import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ayrshare";

const socialPlatformSchema = s.stringEnum("The social network platform name accepted by Ayrshare.", [
  "bluesky",
  "facebook",
  "gmb",
  "instagram",
  "linkedin",
  "pinterest",
  "reddit",
  "snapchat",
  "telegram",
  "threads",
  "tiktok",
  "twitter",
  "youtube",
]);
const rawResponseSchema = s.looseObject("The raw response object returned by Ayrshare.");
const postIdSchema = s.nonEmptyString("The top-level Ayrshare post ID returned by publish_post.");
const statusSchema = s.string("The status returned by Ayrshare.");
const platformFilterSchema = s.array("Optional social platforms to include in the Ayrshare request.", socialPlatformSchema, {
  minItems: 1,
});
const postResultSchema = s.object("A normalized Ayrshare post result.", {
  status: statusSchema,
  id: s.nullable(s.string("The top-level Ayrshare post ID when returned.")),
  postIds: s.array("Per-platform post results returned by Ayrshare.", rawResponseSchema),
  errors: s.array("Per-platform errors returned by Ayrshare.", rawResponseSchema),
  raw: rawResponseSchema,
});
const youtubeOptionsSchema = s.object(
  "YouTube metadata to update on a posted video.",
  {
    visibility: s.stringEnum("The visibility to set on a posted YouTube video.", ["unlisted", "private", "public"]),
    title: s.string("The YouTube video title to update."),
    description: s.string("The YouTube video description to update."),
    categoryId: s.integer("The YouTube category ID to update."),
  },
  { optional: ["visibility", "title", "description", "categoryId"] },
);

export const ayrshareActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_profile",
    description: "Get Ayrshare account or user profile details, including linked social accounts and usage metadata.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving Ayrshare user or profile details.",
      {
        instagramDetails: s.boolean("Whether Ayrshare should include slower additional Instagram details."),
      },
      { optional: ["instagramDetails"] },
    ),
    outputSchema: s.object("The normalized Ayrshare user profile details.", {
      activeSocialAccounts: s.array(
        "The linked social network accounts currently active for the profile.",
        socialPlatformSchema,
      ),
      displayNames: s.array("The social account display records returned by Ayrshare.", rawResponseSchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_post_history",
    description:
      "List Ayrshare post history with optional filters for date range, status, type, and social platforms.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Ayrshare post history.",
      {
        limit: s.integer("The maximum number of history records to return.", { minimum: 1, maximum: 1000 }),
        platforms: s.array("The social platforms to include in the history filter.", socialPlatformSchema),
        startDate: s.string("The inclusive ISO 8601 start date for history results."),
        endDate: s.string("The inclusive ISO 8601 end date for history results."),
        lastDays: s.integer("The number of previous days to include, or 0 for all history.", { minimum: 0 }),
        status: s.stringEnum("The Ayrshare post status to filter by.", [
          "success",
          "error",
          "processing",
          "pending",
          "paused",
          "deleted",
          "awaiting approval",
        ]),
        type: s.stringEnum("Whether to return immediate or scheduled posts.", ["immediate", "scheduled"]),
        autoRepostId: s.string("The auto repost ID to filter by, or all for every auto repost."),
      },
      {
        optional: ["limit", "platforms", "startDate", "endDate", "lastDays", "status", "type", "autoRepostId"],
      },
    ),
    outputSchema: s.object("The normalized Ayrshare post history result.", {
      posts: s.array("The post history records returned by Ayrshare.", rawResponseSchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "publish_post",
    description: "Publish or schedule a social media post through Ayrshare using a JSON-friendly first-pass field set.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for publishing or scheduling a post with Ayrshare.",
      {
        post: s.string("The post text to send to the selected social platforms."),
        platforms: s.array(
          "The social platforms to publish to, or all to publish to every linked platform.",
          s.anyOf("An Ayrshare social platform or the all shortcut.", [
            socialPlatformSchema,
            s.literal("all", { description: "The all-platform shortcut accepted by Ayrshare." }),
          ]),
          { minItems: 1 },
        ),
        mediaUrls: s.array("HTTPS image or video URLs to include in the post.", s.string("An HTTPS media URL Ayrshare can retrieve.")),
        isVideo: s.boolean("Whether the media URLs should be treated as video media."),
        scheduleDate: s.string("The UTC ISO 8601 datetime when Ayrshare should publish the post."),
        validateScheduled: s.boolean("Whether Ayrshare should validate a scheduled post before accepting it."),
        idempotencyKey: s.string("A unique idempotency key used to reject duplicate post submissions."),
        notes: s.string("Internal notes stored with the post and retrievable from history."),
      },
      { optional: ["mediaUrls", "isVideo", "scheduleDate", "validateScheduled", "idempotencyKey", "notes"] },
    ),
    outputSchema: s.object("The normalized Ayrshare publish post result.", {
      status: statusSchema,
      id: s.nullable(s.string("The Ayrshare post ID when returned at the top level.")),
      postIds: s.array("Per-platform publish results returned by Ayrshare.", rawResponseSchema),
      errors: s.array("Per-platform errors returned by Ayrshare.", rawResponseSchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_post",
    description: "Get one Ayrshare post by top-level Ayrshare post ID, including status and per-platform results.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one Ayrshare post.", {
      id: postIdSchema,
    }),
    outputSchema: s.object("The normalized Ayrshare get-post result.", {
      post: postResultSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_post",
    description:
      "Delete one or more Ayrshare posts, delete all pending scheduled posts, or mark a post as manually deleted.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for deleting Ayrshare posts. Provide id, bulk, or deleteAllScheduled.",
      {
        id: postIdSchema,
        bulk: s.array("Ayrshare post IDs to bulk delete.", postIdSchema, { minItems: 1 }),
        deleteAllScheduled: s.boolean("Whether to delete all pending scheduled posts for the profile."),
        markManualDeleted: s.boolean(
          "Whether to mark the Ayrshare post as deleted without deleting it from the social networks.",
        ),
      },
      { optional: ["id", "bulk", "deleteAllScheduled", "markManualDeleted"] },
    ),
    outputSchema: s.object("The normalized Ayrshare delete-post result.", {
      status: statusSchema,
      id: s.nullable(s.string("The Ayrshare post ID when returned for a single delete.")),
      results: s.array("Per-platform or per-post delete results returned by Ayrshare.", rawResponseSchema),
      errors: s.array("Delete errors returned by Ayrshare.", rawResponseSchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_post",
    description:
      "Update mutable Ayrshare post metadata such as scheduleDate, approval status, notes, pause state, comments, or YouTube visibility.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for updating an Ayrshare post. Provide at least one update field in addition to id.",
      {
        id: postIdSchema,
        approved: s.boolean("Whether to approve a post awaiting approval."),
        disableComments: s.boolean("Whether to disable comments on supported social platforms."),
        notes: s.string("Reference notes stored with the Ayrshare post."),
        scheduleDate: s.dateTime("The UTC datetime when Ayrshare should publish the scheduled post."),
        scheduledPause: s.boolean("Whether to pause or unpause a scheduled Ayrshare post."),
        youTubeOptions: youtubeOptionsSchema,
      },
      { optional: ["approved", "disableComments", "notes", "scheduleDate", "scheduledPause", "youTubeOptions"] },
    ),
    outputSchema: s.object("The normalized Ayrshare update-post result.", {
      status: statusSchema,
      id: s.nullable(s.string("The Ayrshare post ID when returned.")),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "retry_post",
    description: "Retry an Ayrshare post whose previous publish attempt failed, returning the new pending post status.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrying an Ayrshare post.", {
      id: postIdSchema,
    }),
    outputSchema: s.object("The normalized Ayrshare retry-post result.", {
      status: statusSchema,
      id: s.nullable(s.string("The Ayrshare post ID returned for the retry.")),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "check_post_length",
    description: "Check weighted social post length and platform validity using Ayrshare's post length validator.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for checking Ayrshare post length.", {
      post: s.string("The post text to measure."),
    }),
    outputSchema: s.object("The normalized Ayrshare post length result.", {
      maxCharLimits: s.record("Maximum character limits keyed by platform.", s.integer("A character limit.")),
      validByPlatform: s.record("Whether the post is valid for each platform.", s.boolean("A validity flag.")),
      weightedLengthByPlatform: s.record("Weighted post lengths keyed by platform.", s.integer("A weighted character length.")),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "validate_post",
    description: "Validate an Ayrshare post payload before publishing, including platform and media URL checks.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for validating an Ayrshare post.",
      {
        post: s.string("The post text to validate."),
        platforms: s.array("The social platforms to validate the post against.", socialPlatformSchema, { minItems: 1 }),
        mediaUrls: s.array("HTTPS image or video URLs to validate with the post.", s.url("An HTTPS media URL Ayrshare can retrieve.")),
        isVideo: s.boolean("Whether the media URLs should be treated as video media."),
      },
      { optional: ["mediaUrls", "isVideo"] },
    ),
    outputSchema: s.object("The normalized Ayrshare validate-post result.", {
      status: statusSchema,
      valid: s.boolean("Whether Ayrshare accepted the post payload as valid."),
      errors: s.array("Validation errors returned by Ayrshare.", rawResponseSchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "verify_media_url",
    description: "Verify that a media URL exists and is accessible to Ayrshare.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for verifying an Ayrshare media URL.", {
      mediaUrl: s.url("The media URL Ayrshare should verify."),
    }),
    outputSchema: s.object("The normalized Ayrshare media URL verification result.", {
      status: statusSchema,
      statusCode: s.nullable(s.integer("The upstream HTTP status code for the media URL.")),
      statusText: s.nullable(s.string("The upstream HTTP status text for the media URL.")),
      contentType: s.nullable(s.string("The media content type returned by Ayrshare.")),
      exists: s.boolean("Whether Ayrshare reported the media URL as reachable."),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_post_analytics",
    description: "Get real-time analytics for an Ayrshare post, optionally limited to selected social platforms.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving Ayrshare post analytics.",
      {
        id: postIdSchema,
        platforms: platformFilterSchema,
      },
      { optional: ["platforms"] },
    ),
    outputSchema: s.object("The normalized Ayrshare post analytics result.", {
      status: statusSchema,
      id: s.nullable(s.string("The top-level Ayrshare post ID when returned.")),
      postIds: s.array("Per-platform analytics results returned by Ayrshare.", rawResponseSchema),
      errors: s.array("Per-platform analytics errors returned by Ayrshare.", rawResponseSchema),
      raw: rawResponseSchema,
    }),
  }),
];

export type AyrshareActionName = (typeof ayrshareActions)[number]["name"];
