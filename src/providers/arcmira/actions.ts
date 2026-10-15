import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const candidate = s.nullable(
  s.object(
    {
      id: s.string("Entity identifier."),
      name: s.string("Display name."),
      type: s.string("Entity category."),
      youtube_channel_id: s.nullableString("Channel identifier, when applicable."),
    },
    { additionalProperties: true },
  ),
);

export const arcmiraActions: readonly ProviderActionDefinition[] = [
  defineProviderAction("arcmira", {
    name: "get_account",
    description: "Read the connected Arcmira account, plan, credit usage and granted scopes.",
    operationType: "read",
    inputSchema: s.object({}),
    outputSchema: s.object(
      {
        account: s.object(
          { id: s.string(), name: s.nullableString("Account name."), kind: s.string(), plan: s.string() },
          { additionalProperties: true },
        ),
        tier: s.string(),
        scopes: s.array(s.string()),
        usage: s.looseObject("Current credit usage."),
      },
      { additionalProperties: true },
    ),
  }),
  defineProviderAction("arcmira", {
    name: "resolve_entity",
    description:
      "Find a person, organization, product, topic or YouTube channel by name. Use the returned identifiers to scope transcript searches; ambiguous names return candidates.",
    operationType: "read",
    inputSchema: s.object(
      {
        q: s.string("Name, handle or YouTube channel URL.", { minLength: 2 }),
        type: s.stringEnum(["person", "organization", "product", "topic", "channel"]),
        context: s.string("Extra context to distinguish names.", { minLength: 2, maxLength: 300 }),
        limit: s.integer({ minimum: 1, maximum: 15 }),
      },
      { required: ["q"] },
    ),
    outputSchema: s.object(
      {
        query: s.string(),
        confidence: s.string(),
        best: candidate,
        suggested: candidate,
        candidates: s.array(candidate),
        ask: s.nullable(s.looseObject("Clarification choices.")),
        note: s.string(),
      },
      { additionalProperties: true },
    ),
  }),
  defineProviderAction("arcmira", {
    name: "search_transcripts",
    description:
      "Search indexed YouTube transcripts for timestamped passages. Filter by channels, speakers, topics, sponsors or organic mentions. Results cover Arcmira's indexed catalog.",
    operationType: "read",
    inputSchema: s.object(
      {
        q: s.string("One topic or phrase.", { minLength: 2 }),
        channel_ids: s.string("Comma-separated YouTube channel IDs, up to eight. Resolve names first."),
        entity_ids: s.string("Comma-separated entity IDs, up to eight, to scope appearances."),
        about: s.string("Comma-separated entity IDs discussed in the passages, up to eight."),
        by: s.string("Comma-separated person IDs speaking the query words, up to eight. Speaker coverage varies."),
        kind: s.string("Comma-separated passage classes: sponsored, organic, mention."),
        after: s.string("Inclusive publication date or ISO date-time."),
        before: s.string("Exclusive publication date or ISO date-time."),
        source: s.stringEnum(["arcmira_premium", "creator_captions", "third_party_quick"]),
        limit: s.integer({ minimum: 1, maximum: 20 }),
      },
      { required: ["q"] },
    ),
    outputSchema: s.object(
      {
        query: s.string(),
        limit: s.integer(),
        returned: s.integer(),
        chunks: s.array(
          s.object(
            {
              video_id: s.string(),
              video_title: s.nullableString("Source title."),
              channel_name: s.nullableString("Source channel."),
              text: s.string("Matching passage."),
              start_seconds: s.nullableInteger("Passage timestamp in seconds."),
              watch_url: s.url("Source video at the passage timestamp."),
              speakers: s.array(s.string("Identified speaker name.")),
            },
            { additionalProperties: true },
          ),
        ),
        filters: s.looseObject("Applied search filters."),
        window: s.looseObject("Applied publication window."),
        as_of: s.nullableString("Result freshness."),
        note: s.string(),
      },
      { additionalProperties: true },
    ),
  }),
  defineProviderAction("arcmira", {
    name: "get_transcript",
    description:
      "Retrieve captions or a Premium transcript for a YouTube video. Premium can start a transcript job and return pending; call again later to check it. Paid reads use credits from your plan, then your on-demand budget. Premium does not fall back to captions.",
    operationType: "write",
    inputSchema: s.object(
      {
        video_id: s.string("YouTube video ID.", { pattern: "^[A-Za-z0-9_-]{11}$" }),
        quality: s.stringEnum(["captions", "premium"]),
        language: s.string("Up to five comma-separated caption language preferences."),
        timestamps: s.boolean("Return timestamped lines rather than paragraphs."),
        start: s.number("Window start in seconds; provide end too.", { minimum: 0 }),
        end: s.number("Window end in seconds, greater than start. Premium still uses whole-video credits.", {
          minimum: 0,
        }),
        retry: s.boolean("Retry a failed Premium job under the account budget."),
        refresh: s.boolean("Refetch captions for a video outside the indexed catalog."),
      },
      { required: ["video_id", "quality"] },
    ),
    outputSchema: s.object(
      {
        state: s.stringEnum(["ready", "pending", "failed"]),
        quality: s.stringEnum(["captions", "premium"]),
        video: s.looseObject("Video metadata when ready."),
        video_id: s.string(),
        lines: s.array(s.looseObject("Timestamped transcript line.")),
        paragraphs: s.array(s.looseObject("Transcript paragraph.")),
        job: s.looseObject("Transcript job with polling guidance."),
        last_attempt: s.looseObject("Failure details for a failed job."),
        note: s.string(),
      },
      { required: ["state", "quality"], additionalProperties: true },
    ),
  }),
];
