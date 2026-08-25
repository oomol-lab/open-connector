import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "screendesk";

const recordingUuidSchema = s.nonEmptyString("The UUID of the Screendesk recording.");
const pageSchema = s.positiveInteger("The one-based Screendesk page number to fetch.");

const paginationSchema = s.object(
  "Screendesk pagination metadata.",
  {
    count: s.integer("The total number of records."),
    page: s.integer("The current page number."),
    items: s.integer("The number of records per page."),
    pages: s.integer("The total number of pages."),
    next_page: s.nullableInteger("The next page number, or null on the last page."),
    prev_page: s.nullableInteger("The previous page number, or null on the first page."),
    last_page: s.integer("The last page number."),
    from: s.integer("The index of the first record on this page."),
    to: s.integer("The index of the last record on this page."),
  },
  { optional: ["next_page", "prev_page"], additionalProperties: true },
);

const recordingSchema = s.object(
  "A Screendesk recording.",
  {
    uuid: s.uuid("The recording UUID."),
    title: s.nullableString("The recording title."),
    summary: s.nullableString("The recording summary."),
    description: s.nullableString("The recording description."),
    metadata: s.unknownObject("Recording timestamps, type, source, URL, and helpdesk metadata."),
    technical_details: s.unknownObject("Technical details captured with the recording."),
    console_logs: s.nullableString("Raw console log output captured during the recording."),
    customer: s.unknownObject("Customer details associated with the recording."),
    user: s.nullable(s.unknownObject("The Screendesk user who owns the recording.")),
    room_insights: s.nullable(s.unknownObject("Live call session insights when available.")),
  },
  {
    optional: [
      "title",
      "summary",
      "description",
      "metadata",
      "technical_details",
      "console_logs",
      "customer",
      "user",
      "room_insights",
    ],
    additionalProperties: true,
  },
);

const userSchema = s.object(
  "A Screendesk workspace user.",
  {
    email: s.email("The user's email address."),
    name: s.string("The user's display name."),
    has_profile_picture: s.boolean("Whether the user has a profile picture."),
    created_at: s.dateTime("When the user was created."),
    updated_at: s.dateTime("When the user was last updated."),
    role: s.stringEnum("The user's workspace role.", ["admin", "member"]),
    notifications: s.unknownObject("The user's Screendesk notification settings."),
  },
  {
    optional: ["name", "has_profile_picture", "created_at", "updated_at", "role", "notifications"],
    additionalProperties: true,
  },
);

export const screendeskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_recordings",
    description: "List Screendesk recordings visible to the authenticated user.",
    inputSchema: s.object(
      "Input parameters for listing Screendesk recordings.",
      {
        page: pageSchema,
        ticketId: s.nonEmptyString("An exact helpdesk ticket, conversation, issue, or object ID to filter by."),
        provider: s.stringEnum("The helpdesk provider used with the ticket ID filter.", [
          "zendesk",
          "intercom",
          "freshdesk",
          "freshdesk_chat",
          "freshchat",
          "freshservice",
          "helpscout",
          "hubspot",
          "jira",
        ]),
      },
      { optional: ["page", "ticketId", "provider"] },
    ),
    outputSchema: s.object(
      "The paginated Screendesk recordings response.",
      { pagination: paginationSchema, records: s.array("The recordings on this page.", recordingSchema) },
      { additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "get_recording",
    description: "Get one Screendesk recording by UUID.",
    inputSchema: s.object("Input parameters for retrieving a Screendesk recording.", {
      recordingUuid: recordingUuidSchema,
    }),
    outputSchema: recordingSchema,
  }),
  defineProviderAction(service, {
    name: "update_recording",
    description: "Update the title, summary, or description of a Screendesk recording.",
    inputSchema: s.requireAnyProperty(
      s.object(
        "Input parameters for updating a Screendesk recording.",
        {
          recordingUuid: recordingUuidSchema,
          title: s.string("The new recording title."),
          summary: s.nullableString("The new recording summary, or null to clear it."),
          description: s.nullableString("The new recording description, or null to clear it."),
        },
        { optional: ["title", "summary", "description"] },
      ),
      ["title", "summary", "description"],
    ),
    outputSchema: recordingSchema,
  }),
  defineProviderAction(service, {
    name: "get_recording_transcript",
    description: "Get one page of the timestamped transcript for a Screendesk recording.",
    inputSchema: s.object(
      "Input parameters for retrieving a Screendesk recording transcript.",
      { recordingUuid: recordingUuidSchema, page: pageSchema },
      { optional: ["page"] },
    ),
    outputSchema: s.object(
      "The Screendesk recording transcript response.",
      {
        recording_uuid: s.uuid("The recording UUID."),
        status: s.stringEnum("The current transcript availability status.", ["ready", "processing", "unavailable"]),
        language: s.nullableString("The detected BCP 47 language code when available."),
        speaker_map: s.record(
          "A mapping from diarization speaker indices to known display names.",
          s.string("The known speaker display name."),
        ),
        pagination: paginationSchema,
        segments: s.array(
          "The timestamped transcript segments on this page.",
          s.object(
            "A timestamped Screendesk transcript segment.",
            {
              start_seconds: s.nonNegativeInteger("The segment start time in seconds."),
              end_seconds: s.nullableInteger("The segment end time in seconds when available.", { minimum: 0 }),
              text: s.string("The transcript segment text."),
              sentences: s.array(
                "Sentence timing and diarization metadata when available.",
                s.unknownObject("Sentence timing and diarization metadata."),
              ),
            },
            { optional: ["end_seconds"], additionalProperties: true },
          ),
        ),
      },
      { optional: ["language"], additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Screendesk workspace users. This action requires an admin token.",
    inputSchema: s.object(
      "Input parameters for listing Screendesk workspace users.",
      { page: pageSchema },
      { optional: ["page"] },
    ),
    outputSchema: s.object(
      "The paginated Screendesk users response.",
      { pagination: paginationSchema, users: s.array("The users on this page.", userSchema) },
      { additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "search_user",
    description: "Find a Screendesk workspace user by email. This action requires an admin token.",
    inputSchema: s.object("Input parameters for finding a Screendesk user.", {
      email: s.email("The exact email address to search for."),
    }),
    outputSchema: userSchema,
  }),
];
