import type { ActionDefinition, ActionOperationType, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "instagram";

interface InstagramScopes {
  basic: string;
  manageComments: string;
  manageInsights: string;
  contentPublish: string;
  manageMessages: string;
}

const instagramScopes: InstagramScopes = {
  basic: "instagram_business_basic",
  manageComments: "instagram_business_manage_comments",
  manageInsights: "instagram_business_manage_insights",
  contentPublish: "instagram_business_content_publish",
  manageMessages: "instagram_business_manage_messages",
};

export const instagramOAuthScopes: string[] = Object.values(instagramScopes);

const basicScopes = [instagramScopes.basic];
const commentScopes = [instagramScopes.basic, instagramScopes.manageComments];
const insightScopes = [instagramScopes.basic, instagramScopes.manageInsights];
const publishingScopes = [instagramScopes.basic, instagramScopes.contentPublish];
const messagingScopes = [instagramScopes.basic, instagramScopes.manageMessages];

const instagramId = (description: string): JsonSchema => s.nonEmptyString(description);

const childMediaSchema = s.object(
  {
    id: instagramId("Instagram child media ID."),
    mediaType: s.stringEnum(["IMAGE", "VIDEO"], { description: "Instagram child media type." }),
    mediaUrl: s.optional(s.url("Public URL returned for the child media when available.")),
    permalink: s.optional(s.url("Instagram permalink returned for the child media when available.")),
    thumbnailUrl: s.optional(s.url("Thumbnail URL returned for a video child when available.")),
    timestamp: s.optional(s.dateTime("Child media creation timestamp.")),
  },
  { required: ["id", "mediaType"], description: "Normalized Instagram carousel child media." },
);

const mediaSchema = s.object(
  {
    id: instagramId("Instagram media ID."),
    mediaType: s.stringEnum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"], {
      description: "Instagram media type.",
    }),
    caption: s.optional(s.string("Media caption when available.")),
    mediaProductType: s.optional(
      s.stringEnum(["AD", "FEED", "STORY", "REELS"], { description: "Instagram media product type." }),
    ),
    mediaUrl: s.optional(s.url("Public media URL when Meta makes it available.")),
    permalink: s.optional(s.url("Instagram permalink when available.")),
    thumbnailUrl: s.optional(s.url("Video thumbnail URL when available.")),
    timestamp: s.optional(s.dateTime("Media creation timestamp.")),
    username: s.optional(s.string("Username that owns the media when returned by Meta.")),
    commentsCount: s.optional(s.nonNegativeInteger("Number of comments reported by Meta.")),
    likeCount: s.optional(s.nonNegativeInteger("Number of likes reported by Meta.")),
    children: s.optional(s.array(childMediaSchema, { maxItems: 10, description: "Carousel child media." })),
  },
  { required: ["id", "mediaType"], description: "Normalized Instagram professional-account media." },
);

const pagingSchema = s.object(
  {
    before: s.optional(s.nonEmptyString("Cursor for the preceding page.")),
    after: s.optional(s.nonEmptyString("Cursor for the following page.")),
    hasPreviousPage: s.boolean("Whether Meta returned a previous-page link."),
    hasNextPage: s.boolean("Whether Meta returned a next-page link."),
  },
  {
    required: ["hasPreviousPage", "hasNextPage"],
    description: "Safe cursor-only pagination metadata. Provider paging URLs are never returned.",
  },
);

function paginationInputSchema(
  limitMaximum: number,
  properties: Record<string, JsonSchema> = {},
  required: string[] = [],
): JsonSchema {
  const schema = s.object(
    {
      ...properties,
      after: s.optional(s.nonEmptyString("Opaque cursor returned by a previous Instagram list call.")),
      before: s.optional(s.nonEmptyString("Opaque cursor returned by a previous Instagram list call.")),
      limit: s.optional(s.integer("Maximum number of items to return.", { minimum: 1, maximum: limitMaximum })),
    },
    { required, description: "Optional cursor pagination input." },
  );
  schema.not = { required: ["after", "before"] };
  return schema;
}

const paginationInput = paginationInputSchema(100);

const commentSchema = s.object(
  {
    id: instagramId("Instagram comment ID."),
    text: s.string("Comment text."),
    timestamp: s.optional(s.dateTime("Comment creation timestamp.")),
    username: s.optional(s.string("Comment author's username when available.")),
    from: s.optional(
      s.object(
        {
          id: s.optional(instagramId("Instagram-scoped author ID when available.")),
          username: s.optional(s.string("Comment author's username when available.")),
        },
        { description: "Comment author metadata returned by Meta." },
      ),
    ),
    parentId: s.optional(instagramId("Parent comment ID when Meta includes reply metadata.")),
  },
  { required: ["id", "text"], description: "Normalized top-level Instagram media comment." },
);

const insightMetricNames = [
  "comments",
  "follows",
  "ig_reels_avg_watch_time",
  "ig_reels_video_view_total_time",
  "impressions",
  "likes",
  "link_clicks",
  "navigation",
  "profile_activity",
  "profile_visits",
  "reach",
  "reels_skip_rate",
  "replies",
  "reposts",
  "saved",
  "shares",
  "total_interactions",
  "views",
];

const imagePublishInput = s.object(
  {
    kind: s.literal("image", { description: "Publish a single image." }),
    imageUrl: s.url("Public HTTPS image URL that Meta can fetch."),
    caption: s.optional(s.string("Post caption.")),
    altText: s.optional(s.string("Accessibility text for the image.")),
  },
  { required: ["kind", "imageUrl"], description: "Single-image publishing input." },
);

const videoFields = {
  videoUrl: s.url("Public HTTPS video URL that Meta can fetch."),
  caption: s.optional(s.string("Post caption.")),
  coverUrl: s.optional(s.url("Public HTTPS cover image URL that Meta can fetch.")),
  thumbOffsetMilliseconds: s.optional(s.nonNegativeInteger("Video thumbnail offset in milliseconds.")),
};

const videoPublishInput = s.object(
  { kind: s.literal("video", { description: "Publish a feed video." }), ...videoFields },
  { required: ["kind", "videoUrl"], description: "Feed-video publishing input." },
);

const reelPublishInput = s.object(
  {
    kind: s.literal("reel", { description: "Publish an Instagram Reel." }),
    ...videoFields,
    shareToFeed: s.optional(s.boolean("Whether to share the Reel to the profile feed.")),
  },
  { required: ["kind", "videoUrl"], description: "Reel publishing input." },
);

const carouselChildInput = s.oneOf(
  [
    s.object(
      {
        kind: s.literal("image"),
        imageUrl: s.url("Public HTTPS image URL that Meta can fetch."),
        altText: s.optional(s.string("Accessibility text for this carousel image.")),
      },
      { required: ["kind", "imageUrl"] },
    ),
    s.object(
      {
        kind: s.literal("video"),
        videoUrl: s.url("Public HTTPS video URL that Meta can fetch."),
      },
      { required: ["kind", "videoUrl"] },
    ),
  ],
  { description: "One image or video carousel child." },
);

const carouselPublishInput = s.object(
  {
    kind: s.literal("carousel", { description: "Publish a carousel post." }),
    caption: s.optional(s.string("Carousel caption.")),
    children: s.array(carouselChildInput, {
      minItems: 2,
      maxItems: 10,
      description: "Two through ten image or video carousel children.",
    }),
  },
  { required: ["kind", "children"], description: "Carousel publishing input." },
);

const existingContainerInput = s.object(
  {
    kind: s.literal("container", { description: "Resume publishing an existing Meta media container." }),
    containerId: instagramId("Existing Meta media container ID."),
  },
  { required: ["kind", "containerId"], description: "Existing-container publishing input." },
);

interface ActionInput {
  name: string;
  operationType: ActionOperationType;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  followUpActions?: string[];
}

function action(input: ActionInput): ActionDefinition {
  return defineProviderAction(service, { ...input, providerPermissions: input.requiredScopes });
}

export const instagramActions: ActionDefinition[] = [
  action({
    name: "get_current_user",
    operationType: "read",
    description: "Get the connected Instagram Business or Creator account profile and account counters.",
    requiredScopes: basicScopes,
    inputSchema: s.object({}, { description: "This action has no input fields." }),
    outputSchema: s.object(
      {
        user: s.object(
          {
            id: instagramId("App-scoped Instagram account ID."),
            userId: s.optional(instagramId("Professional Instagram account ID when Meta returns it.")),
            username: s.nonEmptyString("Instagram username."),
            name: s.optional(s.string("Instagram profile name.")),
            accountType: s.optional(
              s.stringEnum(["Business", "Media_Creator"], { description: "Professional account type." }),
            ),
            profilePictureUrl: s.optional(s.url("Instagram profile picture URL.")),
            followersCount: s.optional(s.nonNegativeInteger("Follower count reported by Meta.")),
            followsCount: s.optional(s.nonNegativeInteger("Following count reported by Meta.")),
            mediaCount: s.optional(s.nonNegativeInteger("Published media count reported by Meta.")),
          },
          { required: ["id", "username"], description: "Connected professional Instagram account." },
        ),
      },
      { required: ["user"], description: "Connected Instagram account profile." },
    ),
    followUpActions: ["instagram.list_media"],
  }),
  action({
    name: "list_media",
    operationType: "read",
    description: "List media owned by the connected Instagram professional account using safe cursor pagination.",
    requiredScopes: basicScopes,
    inputSchema: paginationInput,
    outputSchema: s.object(
      { media: s.array(mediaSchema, { description: "Owned Instagram media." }), paging: pagingSchema },
      { required: ["media", "paging"], description: "Instagram media page." },
    ),
    followUpActions: ["instagram.get_media", "instagram.list_media_comments", "instagram.get_media_insights"],
  }),
  action({
    name: "get_media",
    operationType: "read",
    description: "Get normalized fields for one Instagram media item owned by the connected account.",
    requiredScopes: basicScopes,
    inputSchema: s.object(
      { mediaId: instagramId("Instagram media ID to retrieve.") },
      { required: ["mediaId"], description: "Instagram media lookup input." },
    ),
    outputSchema: s.object({ media: mediaSchema }, { required: ["media"], description: "Instagram media result." }),
  }),
  action({
    name: "list_media_comments",
    operationType: "read",
    description:
      "List top-level comments on owned Instagram media. Reply metadata is included only when Meta returns it; this is not a complete reply tree.",
    requiredScopes: commentScopes,
    inputSchema: paginationInputSchema(
      50,
      { mediaId: instagramId("Instagram media ID whose comments should be listed.") },
      ["mediaId"],
    ),
    outputSchema: s.object(
      { comments: s.array(commentSchema, { description: "Top-level Instagram comments." }), paging: pagingSchema },
      { required: ["comments", "paging"], description: "Instagram comment page." },
    ),
    followUpActions: ["instagram.reply_to_comment"],
  }),
  action({
    name: "get_media_insights",
    operationType: "read",
    description:
      "Get structured insights for owned Instagram media. Meta validates metric, period, breakdown, and media-type compatibility.",
    requiredScopes: insightScopes,
    inputSchema: s.object(
      {
        mediaId: instagramId("Instagram media ID whose insights should be read."),
        metrics: s.array(s.stringEnum(insightMetricNames, { description: "Instagram Login insight metric." }), {
          minItems: 1,
          uniqueItems: true,
          description: "Unique insight metrics to request.",
        }),
        period: s.optional(
          s.stringEnum(["day", "week", "days_28", "month", "lifetime", "total_over_range"], {
            description: "Optional insight aggregation period.",
          }),
        ),
        breakdown: s.optional(
          s.stringEnum(["action_type", "story_navigation_action_type"], {
            description: "Optional insight breakdown.",
          }),
        ),
      },
      { required: ["mediaId", "metrics"], description: "Instagram media insights input." },
    ),
    outputSchema: s.object(
      {
        insights: s.array(
          s.object(
            {
              id: s.optional(instagramId("Insight result ID when returned.")),
              name: s.nonEmptyString("Insight metric name."),
              period: s.optional(s.string("Aggregation period returned by Meta.")),
              title: s.optional(s.string("Metric title returned by Meta.")),
              description: s.optional(s.string("Metric description returned by Meta.")),
              values: s.optional(s.array(s.unknownObject("Metric value and breakdown payload."))),
              totalValue: s.optional(s.unknownObject("Metric total and breakdown payload.")),
            },
            { required: ["name"], description: "Structured Instagram insight result." },
          ),
          { description: "Requested media insights." },
        ),
        paging: pagingSchema,
      },
      { required: ["insights", "paging"], description: "Instagram media insight results." },
    ),
  }),
  action({
    name: "publish_media",
    operationType: "write",
    description:
      "Publish an image, feed video, Reel, or 2-10 item carousel through Meta's media-container workflow, or resume an existing container after an ambiguous failure.",
    requiredScopes: publishingScopes,
    inputSchema: s.oneOf(
      [imagePublishInput, videoPublishInput, reelPublishInput, carouselPublishInput, existingContainerInput],
      { description: "Instagram publishing input selected by kind." },
    ),
    outputSchema: s.object(
      {
        mediaId: instagramId("Published Instagram media ID."),
        containerId: instagramId("Meta media container ID used for publishing."),
        status: s.literal("PUBLISHED", { description: "Completed publishing status." }),
        permalink: s.optional(s.url("Published Instagram permalink when the follow-up read succeeds.")),
        mediaType: s.optional(s.stringEnum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"])),
        mediaProductType: s.optional(s.stringEnum(["FEED", "REELS"])),
      },
      { required: ["mediaId", "containerId", "status"], description: "Completed Instagram publish result." },
    ),
    followUpActions: ["instagram.get_media"],
  }),
  action({
    name: "create_comment",
    operationType: "write",
    description:
      "Create a top-level comment on owned Instagram media. Live-video comments are unsupported and provider errors are returned as failures.",
    requiredScopes: commentScopes,
    inputSchema: s.object(
      {
        mediaId: instagramId("Instagram media ID to comment on."),
        message: s.nonWhitespaceString("Comment text."),
      },
      { required: ["mediaId", "message"], description: "Top-level Instagram comment input." },
    ),
    outputSchema: s.object(
      { commentId: instagramId("New Instagram comment ID."), mediaId: instagramId("Commented media ID.") },
      { required: ["commentId", "mediaId"], description: "Created top-level comment result." },
    ),
  }),
  action({
    name: "reply_to_comment",
    operationType: "write",
    description: "Reply to an existing Instagram media comment and return the new reply ID.",
    requiredScopes: commentScopes,
    inputSchema: s.object(
      {
        commentId: instagramId("Parent Instagram comment ID."),
        message: s.nonWhitespaceString("Reply text."),
      },
      { required: ["commentId", "message"], description: "Instagram comment reply input." },
    ),
    outputSchema: s.object(
      {
        commentId: instagramId("New Instagram reply comment ID."),
        parentCommentId: instagramId("Parent Instagram comment ID."),
      },
      { required: ["commentId", "parentCommentId"], description: "Created Instagram reply result." },
    ),
  }),
  action({
    name: "send_message",
    operationType: "write",
    description:
      "Reply with text to an Instagram-scoped recipient who already initiated a conversation, normally within Meta's 24-hour messaging window. This does not support cold outreach, recipient discovery, bulk messaging, webhooks, or inbox sync.",
    requiredScopes: messagingScopes,
    inputSchema: s.object(
      {
        recipientId: instagramId(
          "Instagram-scoped recipient ID obtained from the operator's Meta webhook integration; this is not a username.",
        ),
        text: s.nonWhitespaceString("UTF-8 reply text or link, limited to 1,000 bytes by the runtime.", {
          maxLength: 1000,
        }),
      },
      { required: ["recipientId", "text"], description: "Policy-constrained Instagram message reply input." },
    ),
    outputSchema: s.object(
      {
        recipientId: instagramId("Instagram-scoped recipient ID returned by Meta."),
        messageId: instagramId("Instagram message ID returned by Meta."),
        threadId: s.optional(instagramId("Conversation or thread ID only when Meta returns one.")),
      },
      { required: ["recipientId", "messageId"], description: "Instagram message reply result." },
    ),
  }),
];
