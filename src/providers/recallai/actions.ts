import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "recallai";

const metadataSchema = s.record(
  "String metadata entries passed to or returned by Recall.ai.",
  s.string("One metadata value."),
);
const botSchema = s.looseObject("Raw Recall.ai bot payload returned by Recall.ai.");
const recallaiPlatformSchema = s.stringEnum("The meeting platform filter accepted by Recall.ai.", [
  "chime_sdk",
  "google_meet",
  "google_meet_media_api",
  "goto_meeting",
  "microsoft_teams",
  "microsoft_teams_live",
  "slack_authenticator",
  "slack_huddle_observer",
  "webex",
  "zoom",
  "zoom_rtms",
]);
const recallaiStatusSchema = s.stringEnum("The Recall.ai bot status filter value.", [
  "analysis_done",
  "analysis_failed",
  "call_ended",
  "done",
  "fatal",
  "in_call_not_recording",
  "in_call_recording",
  "in_waiting_room",
  "joining_call",
  "media_expired",
  "ready",
  "recording_done",
  "recording_permission_allowed",
  "recording_permission_denied",
]);

export const recallaiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_bot",
    description:
      "Create a Recall.ai bot with the core scheduling, recording, automatic-leave, and metadata fields needed for a first-pass meeting bot workflow.",
    inputSchema: s.object(
      "Input parameters for creating a Recall.ai bot.",
      {
        meeting_url: s.nonEmptyString(
          "The meeting URL that Recall.ai should join, such as a Google Meet or Zoom link.",
        ),
        bot_name: s.nonEmptyString("The bot display name shown in the meeting when the platform allows custom names."),
        join_at: s.dateTime("Optional ISO 8601 timestamp for scheduling the bot at least 10 minutes in the future."),
        recording_config: s.looseObject(
          "Optional Recall.ai recording_config object for transcript, media, and recording behavior.",
        ),
        automatic_leave: s.looseObject(
          "Optional Recall.ai automatic_leave object that controls when the bot should leave the meeting.",
        ),
        metadata: metadataSchema,
      },
      { optional: ["bot_name", "join_at", "recording_config", "automatic_leave", "metadata"] },
    ),
    outputSchema: s.object("The normalized output payload for the create_bot action.", {
      bot: botSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_bots",
    description:
      "List Recall.ai bots with optional filters for scheduled date window, meeting URL, platform, status, metadata, and pagination.",
    inputSchema: s.object(
      "Input parameters for listing Recall.ai bots.",
      {
        page: s.positiveInteger("The page number to request."),
        join_at_after: s.date("Only include bots scheduled on or after this YYYY-MM-DD date."),
        join_at_before: s.date("Only include bots scheduled on or before this YYYY-MM-DD date."),
        meeting_url: s.nonEmptyString("Only include bots for the given meeting URL."),
        platform: s.array("Optional list of Recall.ai platform filters.", recallaiPlatformSchema),
        status: s.array("Optional list of Recall.ai bot status filters.", recallaiStatusSchema),
        use_cursor: s.nonEmptyString("When present, ask Recall.ai to use cursor-based pagination semantics."),
        metadata: metadataSchema,
      },
      {
        optional: [
          "page",
          "join_at_after",
          "join_at_before",
          "meeting_url",
          "platform",
          "status",
          "use_cursor",
          "metadata",
        ],
      },
    ),
    outputSchema: s.object(
      "The normalized output payload for the list_bots action.",
      {
        count: s.nullableInteger("The total bot count returned by Recall.ai."),
        next: s.nullableString("The next page URL returned by Recall.ai."),
        previous: s.nullableString("The previous page URL returned by Recall.ai."),
        bots: s.array("The bot results returned by Recall.ai.", botSchema),
      },
      { optional: ["count", "next", "previous"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_bot",
    description:
      "Retrieve one Recall.ai bot by bot ID, including its current status changes, recordings, and metadata.",
    inputSchema: s.object("Input parameters for retrieving one Recall.ai bot.", {
      id: s.nonEmptyString("The Recall.ai bot identifier."),
    }),
    outputSchema: s.object("The normalized output payload for the get_bot action.", {
      bot: botSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_bot_from_call",
    description: "Remove a Recall.ai bot from the meeting immediately when it is already active in the call.",
    inputSchema: s.object("Input parameters for removing one Recall.ai bot from a call.", {
      id: s.nonEmptyString("The Recall.ai bot identifier."),
    }),
    outputSchema: s.object("The normalized output payload for the remove_bot_from_call action.", {
      bot: s.nullable(botSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_bot_media",
    description:
      "Delete the Recall.ai media artifacts stored for a completed bot after downstream processing is finished.",
    inputSchema: s.object("Input parameters for deleting one Recall.ai bot's stored media.", {
      id: s.nonEmptyString("The Recall.ai bot identifier."),
    }),
    outputSchema: s.object("The normalized output payload for the delete_bot_media action.", {
      bot: s.nullable(botSchema),
    }),
  }),
];
