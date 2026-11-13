import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "socialscrape";

/** Platforms whose profile endpoint is looked up by handle. */
export const socialscrapeProfilePlatforms = [
  "instagram",
  "tiktok",
  "twitter",
  "threads",
  "bluesky",
  "snapchat",
  "twitch",
  "truthsocial",
] as const;

/** Platforms whose list of a profile's posts is looked up by handle. */
export const socialscrapeProfilePostPlatforms = ["instagram", "tiktok", "threads", "bluesky", "truthsocial"] as const;

const metaSchema = s.object("Request details SocialScrape returns with every answer.", {
  requestId: s.nonEmptyString("The request identifier to quote when asking SocialScrape for support."),
  creditsCharged: s.nonNegativeInteger("The credits this request cost. A failed request costs none."),
  creditsRemaining: s.nullableInteger("The credits left on the team after this request, when reported."),
  cached: s.boolean("Whether the answer came from SocialScrape's cache instead of a fresh read."),
});

const profileStatsSchema = s.looseObject("Counts the platform publishes for the profile. A count it hides is null.", {
  followers: s.nullableInteger("The number of followers or subscribers."),
  following: s.nullableInteger("The number of accounts the profile follows."),
  posts: s.nullableInteger("The number of posts or videos published."),
  likes: s.nullableInteger("The total likes across the profile's posts, where the platform reports it."),
  views: s.nullableInteger("The total views across the profile's posts, where the platform reports it."),
});

const profileSchema = s.looseObject(
  "A profile in SocialScrape's shared shape. Fields a platform does not publish are null.",
  {
    platform: s.nonEmptyString("The platform the profile is on."),
    id: s.nullableString("The platform's own identifier for the account."),
    handle: s.nullableString("The account handle without a leading at sign."),
    name: s.nullableString("The display name."),
    url: s.nullableString("The address of the profile."),
    bio: s.nullableString("The profile's biography text."),
    avatar_url: s.nullableString("The address of the profile picture."),
    verified: s.nullableBoolean("Whether the platform marks the account as verified."),
    is_private: s.nullableBoolean("Whether the account restricts its posts to approved followers."),
    external_url: s.nullableString("The website link shown on the profile."),
    stats: profileStatsSchema,
  },
  { required: ["platform"] },
);

const postSchema = s.looseObject(
  "One post or video in SocialScrape's shared shape. Fields a platform does not publish are null.",
  {
    platform: s.nonEmptyString("The platform the post is on."),
    id: s.nonEmptyString("The platform's own identifier for the post."),
    url: s.nullableString("The address of the post."),
    type: s.string("The kind of post, such as video, image, carousel or text."),
    title: s.nullableString("The title, on platforms that have one."),
    text: s.nullableString("The caption or body text."),
    published_at: s.nullableString("When the post was published, as an ISO 8601 timestamp."),
    duration_seconds: s.nullableNumber("The length of a video in seconds."),
    stats: s.looseObject("Engagement counts such as views, likes, comments and shares."),
  },
  { required: ["platform", "id"] },
);

const getCreditsAction = defineProviderAction(service, {
  name: "get_credits",
  operationType: "read",
  description: "Get the credits left on the SocialScrape team the connected API key belongs to. Free to call.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for reading the SocialScrape credit balance.", {}),
  outputSchema: s.object("The SocialScrape credit balance.", {
    creditsRemaining: s.nonNegativeInteger("The credits the team can still spend."),
    teamId: s.nonEmptyString("The identifier of the team the API key belongs to."),
    meta: metaSchema,
  }),
});

const getTranscriptAction = defineProviderAction(service, {
  name: "get_transcript",
  operationType: "read",
  description:
    "Get the transcript of a video from its link. The platform is detected from the link: YouTube, TikTok, Instagram, X, Facebook, LinkedIn, Reddit, Twitch clips, Kick clips and Rumble.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for a SocialScrape transcript.",
    {
      url: s.url("The address of the video."),
      language: s.nonEmptyString(
        "The preferred transcript language as a language code such as en or es. Omit it for the video's default.",
      ),
    },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The transcript SocialScrape returned.", {
    transcript: s.looseObject(
      "The transcript in SocialScrape's shared shape.",
      {
        platform: s.nonEmptyString("The platform the video is on."),
        video_id: s.nullableString("The platform's own identifier for the video."),
        url: s.nullableString("The address of the video."),
        language: s.nullableString("The language code of the transcript."),
        source: s.string("Where the text came from, such as captions or speech recognition."),
        duration_seconds: s.nullableNumber("The length of the video in seconds."),
        text: s.string("The whole transcript as one string."),
        segments: s.nullable(
          s.array(
            "The transcript split into timed lines.",
            s.looseObject(
              "One timed line of the transcript.",
              {
                start: s.number("Where the line starts, in seconds from the beginning."),
                end: s.nullableNumber("Where the line ends, in seconds from the beginning."),
                text: s.string("The words spoken in this line."),
              },
              { required: ["start", "text"] },
            ),
          ),
        ),
        available_languages: s.nullable(s.stringArray("The language codes the video has transcripts in.")),
      },
      { required: ["platform", "source", "text"] },
    ),
    meta: metaSchema,
  }),
});

const getProfileAction = defineProviderAction(service, {
  name: "get_profile",
  operationType: "read",
  description: "Get a profile by handle: name, biography, links, verification and follower counts.",
  requiredScopes: [],
  followUpActions: [`${service}.list_profile_posts`],
  inputSchema: s.object("The input payload for a SocialScrape profile lookup.", {
    platform: s.stringEnum("The platform the profile is on.", socialscrapeProfilePlatforms),
    handle: s.nonWhitespaceString("The account handle, with or without a leading at sign.", { maxLength: 253 }),
  }),
  outputSchema: s.object("The profile SocialScrape returned.", {
    profile: profileSchema,
    meta: metaSchema,
  }),
});

const listProfilePostsAction = defineProviderAction(service, {
  name: "list_profile_posts",
  operationType: "read",
  description:
    "List the newest posts or videos a profile has published, one page at a time. Pass the returned cursor to read the next page.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing a profile's posts with SocialScrape.",
    {
      platform: s.stringEnum("The platform the profile is on.", socialscrapeProfilePostPlatforms),
      handle: s.nonWhitespaceString("The account handle, with or without a leading at sign.", { maxLength: 253 }),
      cursor: s.nonEmptyString("The cursor returned by the previous page. Omit it for the first page."),
    },
    { optional: ["cursor"] },
  ),
  outputSchema: s.object("One page of a profile's posts.", {
    posts: s.array("The posts on this page, newest first.", postSchema),
    cursor: s.nullableString("The cursor for the next page, or null when there is none."),
    hasMore: s.boolean("Whether another page can be read with the cursor."),
    meta: metaSchema,
  }),
});

export const socialscrapeActions: ActionDefinition[] = [
  getCreditsAction,
  getTranscriptAction,
  getProfileAction,
  listProfilePostsAction,
];
