import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "postonce";

const postIdSchema = s.uuid("The PostOnce post ID returned by create_post or list_posts.");

const mediaSchema = s.object(
  "One image or video to attach, given by a public URL PostOnce downloads when it publishes.",
  {
    url: s.url("The absolute HTTP or HTTPS address of the image or video."),
    type: s.stringEnum("Whether the file is an image or a video.", ["image", "video"]),
    width: s.positiveInteger("The width in pixels, when known."),
    height: s.positiveInteger("The height in pixels, when known."),
    size: s.positiveInteger("The file size in bytes, when known."),
    duration: s.number("The video length in seconds, when known.", { minimum: 0 }),
    thumbnail_url: s.url(
      "A JPEG or PNG cover image for a video, used on Instagram Reels and Stories, Facebook Reels and TikTok.",
    ),
  },
  { optional: ["type", "width", "height", "size", "duration", "thumbnail_url"] },
);

const targetInputSchema = s.object(
  "One connected account to publish to.",
  {
    account_id: s.nonEmptyString("The connected account ID returned by list_accounts."),
    content_override: s.string("Text to use for this account instead of the shared content."),
    platform_options: s.unknownObject(
      "Platform-specific settings for this account, such as a YouTube or LinkedIn title, a Reddit subreddit, or ai_generated to request the platform's AI-content label.",
    ),
  },
  { optional: ["content_override", "platform_options"] },
);

const accountSchema = s.looseObject(
  "A social account connected to PostOnce.",
  {
    id: s.string("The account ID to use as a post target."),
    platform: s.string("The social network, such as linkedin, twitter, threads, bluesky, instagram or tiktok."),
    username: s.string("The account handle or name on the social network."),
    avatar_url: s.nullableString("The address of the account picture."),
    status: s.string("active, auth_required (reconnect it in PostOnce) or disconnected."),
    capabilities: s.nullable(s.unknownObject("What the account can publish: text, images, video, replies, threads.")),
    media_requirements: s.nullable(
      s.unknownObject("Media rules for the account, including required_media when a text-only post is not allowed."),
    ),
    created_at: s.string("When the account was connected."),
    updated_at: s.string("When the account was last updated."),
  },
  { required: ["id", "platform", "status"] },
);

const postTargetSchema = s.looseObject(
  "The delivery state of a post on one account.",
  {
    target_post_id: s.string("The destination ID used by retry_post_target."),
    account_id: s.nullableString("The connected account ID."),
    platform: s.nullableString("The social network."),
    username: s.nullableString("The account handle."),
    status: s.string("pending, scheduled, processing, submitted, published, failed, skipped or cancelled."),
    error: s.nullableString("Why delivery failed, when it did."),
    platform_post_id: s.nullableString("The post ID on the social network once published."),
    platform_post_url: s.nullableString("The address of the published post."),
    scheduled_time: s.nullableString("When this destination is scheduled to publish."),
  },
  { required: ["target_post_id", "status"] },
);

const postSchema = s.looseObject(
  "A PostOnce post with its per-account delivery state.",
  {
    id: s.string("The PostOnce post ID."),
    content: s.string("The shared post text."),
    external_id: s.nullableString("Your own reference for the post."),
    media: s.array("The attached media.", s.unknownObject("One attached image or video.")),
    origin: s.nullableString("ui, api or workflow. Workflow posts are read-only."),
    publish_at: s.nullableString("When a scheduled post publishes; null for an immediate post."),
    status: s.string("queued, scheduled, processing, partial, published, failed or cancelled."),
    created_at: s.nullableString("When the post was created."),
    targets: s.array("The delivery state on each account.", postTargetSchema),
  },
  { required: ["id", "status", "targets"] },
);

const postOutputSchema = s.object("The post returned by PostOnce.", { post: postSchema });

const postEditFields = {
  content: s.string("The post text shared by every target unless a target overrides it."),
  media: s.array("Images or videos to attach.", mediaSchema),
  publish_at: s.dateTime("The UTC time to publish at. Leave it out to publish now."),
  external_id: s.string("Your own reference for the post, such as a campaign or content ID."),
};

export const postonceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    operationType: "read",
    description:
      "List the social accounts connected to PostOnce, with each account's ID, network, status and media rules. Use the IDs as create_post targets.",
    requiredScopes: ["accounts:read"],
    inputSchema: s.object("No input is needed to list connected accounts.", {}),
    outputSchema: s.object("The connected accounts.", {
      accounts: s.array("Every account owned by the API key's profile, including disconnected ones.", accountSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    operationType: "read",
    description:
      "List PostOnce posts newest first, including scheduled posts and posts published by workflows, with each account's delivery state.",
    requiredScopes: ["posts:read"],
    inputSchema: s.object(
      "Paging options for listing posts.",
      {
        limit: s.integer("The maximum number of posts to return.", { minimum: 1, maximum: 100 }),
        after: s.uuid("Return posts older than this post ID, usually the last ID from the previous page."),
      },
      { optional: ["limit", "after"] },
    ),
    outputSchema: s.object("A page of posts.", {
      posts: s.array("The posts, newest first.", postSchema),
      meta: s.unknownObject("Paging details returned by PostOnce."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_post",
    operationType: "write",
    description:
      "Publish a post to one or more connected accounts now, or schedule it with publish_at. Text, media URLs and per-account overrides go in one request.",
    requiredScopes: ["posts:write"],
    inputSchema: s.object(
      "The post to publish or schedule.",
      {
        ...postEditFields,
        targets: s.array("The connected accounts to publish to.", targetInputSchema, { minItems: 1 }),
        idempotency_key: s.string("A stable key for retries: repeating it with the same post returns the original.", {
          minLength: 1,
          maxLength: 200,
        }),
      },
      { optional: ["content", "media", "publish_at", "external_id", "idempotency_key"] },
    ),
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_post",
    operationType: "read",
    description: "Get one PostOnce post with its status and the delivery state and published URL on each account.",
    requiredScopes: ["posts:read"],
    inputSchema: s.object("The post to read.", { id: postIdSchema }),
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_post",
    operationType: "write",
    description:
      "Change a scheduled PostOnce post before it publishes: its text, media, publish time, reference or targets.",
    requiredScopes: ["posts:write"],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The scheduled post to change and at least one field to update.",
        {
          id: postIdSchema,
          ...postEditFields,
          external_id: s.nullableString("Your own reference for the post. Set null to clear it."),
          publish_at: s.nullable(s.dateTime("The UTC publish time. Set null to clear the scheduled time.")),
          targets: s.array("The connected accounts to publish to.", targetInputSchema, { minItems: 1 }),
        },
        { optional: ["content", "media", "publish_at", "external_id", "targets"] },
      ),
      ["content", "media", "publish_at", "external_id", "targets"],
    ),
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_post",
    operationType: "destructive",
    description:
      "Cancel a scheduled or still-pending PostOnce post. Copies already published on social networks are not removed.",
    requiredScopes: ["posts:write"],
    inputSchema: s.object("The post to cancel.", { id: postIdSchema }),
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "retry_post_target",
    operationType: "write",
    description:
      "Retry one failed account of a PostOnce post without publishing again to the accounts that already succeeded.",
    requiredScopes: ["posts:write"],
    inputSchema: s.object("The failed destination to retry.", {
      id: postIdSchema,
      target_post_id: s.nonEmptyString("The failed destination's target_post_id from get_post."),
    }),
    outputSchema: postOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_post_analytics",
    operationType: "read",
    description:
      "Get current views, likes, comments, shares and saves for each published copy of a PostOnce post on TikTok, Instagram, YouTube and Facebook.",
    requiredScopes: ["posts:read"],
    inputSchema: s.object("The post to read analytics for.", { id: postIdSchema }),
    outputSchema: s.object("The post's analytics.", {
      analytics: s.looseObject(
        "Metrics for each published copy. Copies on other networks, or not yet published, are left out.",
        {
          id: s.string("The PostOnce post ID."),
          media_url: s.nullableString("The video or image file PostOnce published."),
          targets: s.array(
            "Metrics for each published copy. A metric the platform does not report is null.",
            s.looseObject(
              "Metrics for one published copy.",
              {
                account_id: s.string("The connected account ID."),
                platform: s.string("The social network."),
                platform_post_id: s.nullableString("The post ID on the social network."),
                url: s.nullableString("The address of the published post."),
                published_at: s.string("When the copy was published."),
                metrics_status: s.string("ok, reconnect, limited or unavailable."),
                views: s.nullableInteger("Views."),
                likes: s.nullableInteger("Likes."),
                comments: s.nullableInteger("Comments."),
                shares: s.nullableInteger("Shares."),
                saves: s.nullableInteger("Saves."),
                engagement_rate: s.nullableNumber("(likes + comments + shares + saves) / views."),
                last_updated: s.nullableString("When the numbers were read from the platform."),
              },
              { required: ["account_id", "platform"] },
            ),
          ),
        },
        { required: ["id", "targets"] },
      ),
    }),
  }),
];
