import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ritekit";
const responseCodeSchema = s.nullableInteger("The response code reported by RiteKit when it is present.");
const responseMessageSchema = s.nullableString("The response message reported by RiteKit when it is present.");
const hashtagMetricSchema = s.requiredObject("A hashtag and its current RiteKit engagement metrics.", {
  hashtag: s.string("The hashtag name returned by RiteKit."),
  tag: s.string("The normalized tag name returned by RiteKit."),
  tweets: s.nullableNumber("The weighted number of posts per hour using the hashtag."),
  exposure: s.nullableNumber("The weighted number of hourly impressions associated with the hashtag."),
  retweets: s.nullableNumber("The weighted number of reposts per hour associated with the hashtag."),
  images: s.nullableNumber("The image share or image percentage reported for the hashtag."),
  links: s.nullableNumber("The link share or link percentage reported for the hashtag."),
  mentions: s.nullableNumber("The mention share or mention percentage reported for the hashtag."),
  color: s.nullableInteger("The RiteKit engagement color code for the hashtag when available."),
  mediaCount: s.nullableNumber("The social media count reported for image-derived hashtag suggestions."),
  raw: s.looseObject("The raw hashtag metric object returned by RiteKit."),
});
const trendingHashtagSchema = s.requiredObject("A currently trending hashtag returned by RiteKit.", {
  tag: s.string("The trending hashtag name."),
  tweets: s.nullableNumber("The weighted number of posts using the trending hashtag."),
  exposure: s.nullableNumber("The weighted number of impressions associated with the trending hashtag."),
  retweets: s.nullableNumber("The weighted number of reposts associated with the trending hashtag."),
  links: s.nullableNumber("The link share or link percentage reported for the trending hashtag."),
  photos: s.nullableNumber("The photo share or photo percentage reported for the trending hashtag."),
  mentions: s.nullableNumber("The mention share or mention percentage reported for the trending hashtag."),
  color: s.nullableInteger("The RiteKit engagement color code for the trending hashtag."),
  raw: s.looseObject("The raw trending hashtag object returned by RiteKit."),
});
const suggestionOutputSchema = s.requiredObject("The response returned when RiteKit generates hashtag suggestions.", {
  code: responseCodeSchema,
  message: responseMessageSchema,
  hashtags: s.array("The hashtag suggestions returned by RiteKit.", hashtagMetricSchema),
});

export const ritekitActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_hashtag_stats",
    operationType: "read",
    description: "Get current engagement statistics for one or more hashtags.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for reading RiteKit hashtag statistics.", {
      tags: s.array(
        "The hashtag names to analyze.",
        s.nonWhitespaceString("One hashtag name, with or without a leading hash sign."),
        { minItems: 1, maxItems: 100 },
      ),
    }),
    outputSchema: s.requiredObject("The response returned when reading RiteKit hashtag statistics.", {
      code: responseCodeSchema,
      message: responseMessageSchema,
      hashtags: s.array("The hashtag names acknowledged by RiteKit.", s.string("One acknowledged hashtag name.")),
      stats: s.array("The engagement statistics returned for the hashtags.", hashtagMetricSchema),
      colorLabels: s.array(
        "The ordered labels for RiteKit hashtag color codes.",
        s.string("One RiteKit color-code label."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "auto_hashtag",
    operationType: "read",
    description: "Add relevant hashtags to social post text with RiteKit.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for automatically adding hashtags to a post.",
      {
        post: s.nonWhitespaceString("The social post text to enhance with relevant hashtags."),
        maxHashtags: s.integer("The maximum number of hashtags RiteKit should add.", { minimum: 1 }),
        hashtagPosition: s.stringEnum("Where RiteKit should place generated hashtags.", ["auto", "end"]),
      },
      { optional: ["maxHashtags", "hashtagPosition"] },
    ),
    outputSchema: s.requiredObject("The response returned when automatically adding hashtags.", {
      code: responseCodeSchema,
      message: responseMessageSchema,
      post: s.string("The post text after RiteKit adds the selected hashtags."),
    }),
  }),
  defineProviderAction(service, {
    name: "suggest_hashtags_for_text",
    operationType: "write",
    description: "Generate engagement-ranked hashtag suggestions from text.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for generating hashtags from text.", {
      text: s.nonWhitespaceString("The topic or text used to generate hashtag suggestions.", { maxLength: 1000 }),
    }),
    outputSchema: suggestionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "suggest_hashtags_for_url",
    operationType: "write",
    description: "Generate engagement-ranked hashtag suggestions from a public webpage URL.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for generating hashtags from a webpage.", {
      pageUrl: s.url("The public webpage URL that RiteKit should inspect for hashtag suggestions."),
    }),
    outputSchema: suggestionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "suggest_hashtags_for_image",
    operationType: "write",
    description: "Generate engagement-ranked hashtag suggestions from a public image URL.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for generating hashtags from an image.", {
      imageUrl: s.url("The public image URL that RiteKit should inspect for hashtag suggestions."),
    }),
    outputSchema: suggestionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_trending_hashtags",
    operationType: "read",
    description: "List hashtags that are currently trending according to RiteKit.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing trending hashtags.",
      {
        green: s.boolean("Whether to limit results to hashtags with RiteKit's green rating."),
        latin: s.boolean("Whether to limit results to hashtags written with Latin characters."),
      },
      { optional: ["green", "latin"] },
    ),
    outputSchema: s.requiredObject("The response returned when listing RiteKit trending hashtags.", {
      code: responseCodeSchema,
      message: responseMessageSchema,
      hashtags: s.array("The currently trending hashtags.", trendingHashtagSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "clean_banned_instagram_hashtags",
    operationType: "read",
    description: "Remove hashtags that RiteKit identifies as currently blocked by Instagram.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input payload for cleaning blocked Instagram hashtags.", {
      post: s.nonWhitespaceString("The Instagram post text whose hashtags should be checked."),
    }),
    outputSchema: s.requiredObject("The response returned when cleaning blocked Instagram hashtags.", {
      message: responseMessageSchema,
      post: s.string("The post text after RiteKit removes blocked hashtags."),
      bannedHashtags: s.array(
        "The blocked hashtags removed from the post.",
        s.string("One blocked Instagram hashtag."),
      ),
    }),
  }),
];
