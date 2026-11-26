import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "publora";

const platformTypes = [
  "twitter",
  "linkedin",
  "instagram",
  "threads",
  "tiktok",
  "youtube",
  "facebook",
  "bluesky",
  "mastodon",
  "telegram",
  "pinterest",
];

const commentPlatformTypes = platformTypes.filter((platform) => platform !== "pinterest");

const postStatuses = ["draft", "scheduled", "published", "failed", "partially_published"];

const postGroupIdSchema = s.stringPattern("^[a-f0-9]{24}$", {
  description: "The Publora post group ID returned by create_post or list_posts.",
});

const connectionIdsSchema = s.array(
  "Connection IDs from list_connections, in the platform-platformId form, such as linkedin-ABC123. Each ID may appear once.",
  s.nonEmptyString("One connection ID."),
  { minItems: 1, uniqueItems: true },
);

const firstCommentsSchema = s.array(
  "Up to three comments Publora posts under the published post, in order, on LinkedIn, X, Threads, Bluesky and Mastodon. A later comment waits for the previous one; a failed comment never changes the post.",
  s.object(
    "One first comment.",
    {
      text: s.string("The comment text.", { maxLength: 25000 }),
      platforms: s.array(
        "Platform types that get the comment, never connection IDs. Leave it out for every supported target.",
        s.stringEnum("A platform type.", commentPlatformTypes),
      ),
      delaySeconds: s.integer(
        "Seconds to wait after publication for the first comment, or after the previous comment for later ones.",
        { minimum: 0, maximum: 86400 },
      ),
    },
    { optional: ["platforms", "delaySeconds"] },
  ),
  { maxItems: 3 },
);

const mediaUrlsSchema = s.array(
  "Public HTTPS addresses of images or videos that Publora downloads when the post is saved: up to 25 MB per image, 150 MB per video and 300 MB in total. If one file fails, none are attached.",
  s.url("One image or video address."),
  { minItems: 1, maxItems: 10 },
);

const platformSettingsSchema = s.unknownObject(
  "Per-platform options keyed by platform type: instagram, tiktok, youtube, threads, twitter, telegram or linkedin, such as instagram.videoType, youtube.title and privacy, tiktok.viewerSetting or linkedin.repostParentUrn. Publora rejects any other key with PLATFORM_SETTING_UNKNOWN.",
);

const warningsSchema = s.array(
  "Non-blocking notes, such as SCHEDULED_TIME_COERCED when a past time was moved to now or FIRST_COMMENT_UNSUPPORTED_PLATFORMS.",
  s.looseObject("One warning.", {
    code: s.string("The stable warning code."),
    message: s.string("What happened."),
  }),
);

const idempotencyKeySchema = s.nonWhitespaceString(
  "A unique key, such as a UUID, sent as Idempotency-Key. Repeating it with the same body within 24 hours returns the first result instead of acting twice.",
);

const connectionSchema = s.looseObject(
  "A social account connected to Publora.",
  {
    platformId: s.string("The connection ID to use in create_post platforms, such as linkedin-ABC123."),
    username: s.nullableString("The account handle on the social network."),
    displayName: s.nullableString("The account's display name."),
    profileUrl: s.nullableString("The account's profile address."),
    tokenStatus: s.string("valid, expiring_soon, expired or unknown."),
    connectionStatus: s.string("active, or reconnect_required when the account must be reconnected in Publora."),
    accessTokenExpiresAt: s.nullableString("When the platform token expires."),
    lastSuccessfulPost: s.nullableString("When Publora last published to this account."),
    lastError: s.nullable(s.unknownObject("The last publishing error on this account, with message and occurredAt.")),
  },
  { required: ["platformId"] },
);

const platformPostSchema = s.looseObject(
  "The post on one connected account.",
  {
    platform: s.string("The social network."),
    platformId: s.nullableString(
      "The account's own ID on the social network, without the platform prefix, so not a connection ID for create_post or update_post.",
    ),
    content: s.string("The text published to this account."),
    status: s.string("draft, scheduled, pending, processing, published or failed."),
    postedId: s.nullableString("The post ID on the social network once published."),
    permalink: s.nullableString("The address of the published post, when the network provides one."),
    publishedAt: s.nullableString("When the post was published to this account."),
    error: s.unknown("Why publishing failed on this account, when it did."),
  },
  { required: ["platform", "status"] },
);

const postEditFields = {
  content: s.string("The post text shared by every account."),
  scheduledTime: s.dateTime("The UTC time to publish at, such as 2026-12-01T14:00:00Z."),
  publishNow: s.boolean("Publish immediately. Cannot be combined with a future scheduledTime."),
  platformSettings: platformSettingsSchema,
  firstComments: firstCommentsSchema,
  mediaUrls: mediaUrlsSchema,
  idempotencyKey: idempotencyKeySchema,
};

export const publoraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_connections",
    operationType: "read",
    description:
      "List the social accounts connected to Publora, with each connection ID and whether its token still works. Use the IDs as create_post platforms.",
    inputSchema: s.requiredObject("No input is needed to list connections.", {}),
    outputSchema: s.requiredObject("The connected accounts.", {
      connections: s.array("Every connected account, including ones that need reconnecting.", connectionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_account_context",
    operationType: "read",
    description:
      "Read the Publora plan, enabled features, monthly and scheduled post quotas, how far ahead posts can be scheduled, and which platforms the plan allows.",
    inputSchema: s.object(
      "Optionally the time of a planned post, to read the quota of that month.",
      {
        scheduledTime: s.dateTime("A planned publish time. Leave it out for the current month."),
      },
      { optional: ["scheduledTime"] },
    ),
    outputSchema: s.requiredObject("The account context.", {
      context: s.looseObject(
        "Plan, features and quotas.",
        {
          plan: s.unknownObject("The plan key and name."),
          features: s.unknownObject("Which features the plan enables, such as publishing and apiAccess."),
          quotas: s.unknownObject("Monthly posts, scheduled posts, schedule horizon and connection limits."),
          allowedPlatforms: s.nullable(
            s.array("Platform types the plan can publish to; null means every platform.", s.string("A platform type.")),
          ),
          serverTime: s.string("Publora's current time."),
        },
        { required: ["plan", "quotas"] },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "create_post",
    operationType: "write",
    description:
      "Create a Publora post for one or more connected accounts: saved as a draft, scheduled with scheduledTime, or published at once with publishNow. Text, media URLs, per-platform settings and first comments go in one request.",
    inputSchema: s.object(
      "The post to create.",
      {
        ...postEditFields,
        platforms: connectionIdsSchema,
      },
      {
        optional: [
          "content",
          "scheduledTime",
          "publishNow",
          "platformSettings",
          "firstComments",
          "mediaUrls",
          "idempotencyKey",
        ],
      },
    ),
    outputSchema: s.object(
      "The created post group.",
      {
        postGroupId: s.string("The ID to read, update or delete the post with."),
        scheduledTime: s.nullableString("The publish time Publora stored; null for a draft."),
        warnings: warningsSchema,
      },
      { optional: ["scheduledTime", "warnings"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_post",
    operationType: "read",
    description:
      "Get one Publora post with its overall status and, for each account, its text, status, published ID and address.",
    inputSchema: s.requiredObject("The post to read.", { postGroupId: postGroupIdSchema }),
    outputSchema: s.requiredObject("The post.", {
      post: s.looseObject(
        "A Publora post group.",
        {
          postGroupId: s.string("The post group ID."),
          status: s.stringEnum("The overall status.", postStatuses),
          scheduledTime: s.nullableString("When the post is or was scheduled to publish."),
          platforms: s.array("The connection IDs the post targets.", s.string("A connection ID.")),
          posts: s.array("The post on each connected account.", platformPostSchema),
          media: s.array("Attached media.", s.unknownObject("One media file.")),
        },
        { required: ["postGroupId", "status", "posts"] },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    operationType: "read",
    description:
      "List Publora posts page by page, filtered by status, platform or date range, with each account's delivery status.",
    inputSchema: s.object(
      "Filters and paging.",
      {
        page: s.integer("The page number, starting at 1.", { minimum: 1 }),
        limit: s.integer("Posts per page.", { minimum: 1, maximum: 100 }),
        status: s.stringEnum("Only posts with this status.", postStatuses),
        platform: s.stringEnum("Only posts that target this platform type.", platformTypes),
        sortBy: s.stringEnum("The field to sort by.", ["createdAt", "updatedAt", "scheduledTime"]),
        sortOrder: s.stringEnum("The sort direction.", ["asc", "desc"]),
        fromDate: s.dateTime("Only posts on or after this time."),
        toDate: s.dateTime("Only posts on or before this time."),
      },
      { optional: ["page", "limit", "status", "platform", "sortBy", "sortOrder", "fromDate", "toDate"] },
    ),
    outputSchema: s.requiredObject("A page of posts.", {
      posts: s.array(
        "The posts on this page.",
        s.looseObject(
          "A post group summary.",
          {
            postGroupId: s.string("The post group ID."),
            content: s.string("The post text."),
            status: s.string("The overall status."),
            scheduledTime: s.nullableString("When the post is or was scheduled to publish."),
            platforms: s.array(
              "The status on each targeted account.",
              s.unknownObject("platformId, platform and status."),
            ),
          },
          { required: ["postGroupId", "status"] },
        ),
      ),
      pagination: s.unknownObject("page, limit, totalItems, totalPages, hasNextPage and hasPrevPage."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_post",
    operationType: "write",
    description:
      "Change a Publora draft or scheduled post: its text, accounts, media, settings, comments or time, move it between draft and scheduled, or publish it now. A platforms list replaces the stored one; mediaUrls are added to the media already attached.",
    inputSchema: s.requireAnyProperty(
      s.object(
        "The post to change and at least one field to update.",
        {
          postGroupId: postGroupIdSchema,
          ...postEditFields,
          mediaUrls: s.array(
            "Public HTTPS addresses of images or videos to add to the media already attached; this provider has no action that removes media. Send idempotencyKey with them, or a retried update attaches the files twice.",
            s.url("One image or video address."),
            { minItems: 1, maxItems: 10 },
          ),
          platforms: s.array(
            "The complete new list of connection IDs. Accounts left out lose their copy of the post.",
            s.nonEmptyString("One connection ID."),
            { uniqueItems: true },
          ),
          status: s.stringEnum("draft to unschedule the post, scheduled to schedule it.", ["draft", "scheduled"]),
        },
        {
          optional: [
            "content",
            "platforms",
            "status",
            "scheduledTime",
            "publishNow",
            "platformSettings",
            "firstComments",
            "mediaUrls",
            "idempotencyKey",
          ],
        },
      ),
      [
        "content",
        "platforms",
        "status",
        "scheduledTime",
        "publishNow",
        "platformSettings",
        "firstComments",
        "mediaUrls",
      ],
    ),
    outputSchema: s.object(
      "The updated post group.",
      {
        message: s.string("Publora's confirmation."),
        scheduledTime: s.nullableString("The publish time Publora stored."),
        warnings: warningsSchema,
        postGroup: s.unknownObject("The post group after the change: _id, status, content, platforms, scheduledTime."),
      },
      { optional: ["message", "scheduledTime", "warnings", "postGroup"] },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_post",
    operationType: "destructive",
    description:
      "Delete a Publora post group with its per-account posts and uploaded media, for example to cancel a scheduled post.",
    inputSchema: s.requiredObject("The post to delete.", { postGroupId: postGroupIdSchema }),
    outputSchema: s.requiredObject("The deleted post group.", {
      postGroupId: s.string("The ID of the deleted post group."),
      deleted: s.boolean("True once Publora has deleted it."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_post_logs",
    operationType: "read",
    description:
      "Get the publishing events of a Publora post from the last 90 days, oldest first: scheduling, each attempt, retries, successes and failures with their HTTP status and error.",
    inputSchema: s.requiredObject("The post to read logs for.", { postGroupId: postGroupIdSchema }),
    outputSchema: s.requiredObject("The post's publishing events.", {
      logs: s.array(
        "Up to 100 events.",
        s.looseObject(
          "One publishing event.",
          {
            platform: s.string("The social network."),
            event: s.string(
              "scheduled, processing, publish_attempted, publish_succeeded, publish_failed, publish_retry, status_changed or a media step.",
            ),
            error: s.nullableString("The error, for a failed step."),
            httpStatus: s.nullableInteger("The platform's HTTP status, when recorded."),
            retryCount: s.integer("How many retries came before this event."),
            createdAt: s.string("When the event happened."),
          },
          { required: ["event", "createdAt"] },
        ),
      ),
    }),
  }),
];
