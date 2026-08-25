import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chorus";

const nonEmptyStringSchema = (description: string): JsonSchema => s.string({ description, minLength: 1 });
const emptyInputSchema = s.object("No input is required for this Chorus action.", {});
const looseResourceSchema = s.looseObject("A Chorus JSON:API resource.", {
  id: s.string("The Chorus resource ID."),
  type: s.string("The Chorus resource type."),
  attributes: s.looseObject("The Chorus resource attributes."),
});
const engagementSchema = s.looseObject("A Chorus engagement returned by the v3 engagements API.", {
  engagement_id: s.string("The Chorus engagement ID."),
  subject: s.string("The engagement subject."),
  user_id: s.integer("The Chorus user ID of the engagement owner."),
  user_email: s.string("The email address of the engagement owner."),
  user_name: s.string("The name of the engagement owner."),
  date_time: s.number("The engagement start time as returned by Chorus."),
  duration: s.number("The engagement duration in seconds."),
  participants: s.array("Participants included in the engagement.", s.looseObject("A Chorus engagement participant.")),
});

const chorusConversationFieldSchema = s.stringEnum("A Chorus conversation field to populate.", [
  "account",
  "company_name",
  "_created_at",
  "_modified_at",
  "deal",
  "disposition",
  "language",
  "metrics",
  "meeting.id",
  "name",
  "owner",
  "owner.email",
  "participants",
  "private",
  "recording",
  "recording.audio_only",
  "recording.autojoin",
  "recording.autojoin_reason",
  "recording.clusters",
  "recording.duration",
  "recording.end_reason",
  "recording.recordable",
  "recording.schedule_end_time",
  "recording.schedule_start_time",
  "recording.start_time",
  "recording.thumbnails",
  "recording.trackers",
  "recording.utterances",
  "source",
  "status",
  "user_company_name",
]);

const commaStringArraySchema = (description: string): JsonSchema =>
  s.array(description, nonEmptyStringSchema("A Chorus string value."), { minItems: 1 });

const integerArraySchema = (description: string): JsonSchema =>
  s.array(description, s.integer("A Chorus numeric ID."), { minItems: 1 });

function optionalKeys<T extends Record<string, JsonSchema>>(properties: T): Array<keyof T & string> {
  return Object.keys(properties) as Array<keyof T & string>;
}

const listEngagementsInputFields = {
  compliance: nonEmptyStringSchema("Filter by Chorus call recording compliance flag."),
  continuationKey: nonEmptyStringSchema("The Chorus continuation_key returned by the previous page."),
  dispositionConnected: s.boolean("Filter by Chorus connected disposition."),
  dispositionGatekeeper: s.boolean("Filter by Chorus gatekeeper disposition."),
  dispositionTree: s.boolean("Filter by Chorus phone tree disposition."),
  dispositionVoicemail: s.boolean("Filter by Chorus voicemail disposition."),
  engagementIds: commaStringArraySchema("One or more Chorus engagement IDs to retrieve."),
  engagementType: nonEmptyStringSchema("Filter by Chorus engagement type."),
  contentType: nonEmptyStringSchema("Filter by Chorus engagement content type."),
  maxDate: s.dateTime("Only include engagements on or before this datetime."),
  maxDuration: s.number("Only include engagements with duration at or below this number of seconds."),
  minDate: s.dateTime("Only include engagements on or after this datetime."),
  minDuration: s.number("Only include engagements with duration at or above this number of seconds."),
  participantsEmail: s.email("Filter by a participant email address."),
  teamIds: integerArraySchema("One or more Chorus team IDs for engagement owners."),
  userIds: integerArraySchema("One or more Chorus user IDs for engagement owners."),
  withTrackers: s.boolean("Whether to return tracker information with engagements."),
} as const satisfies Record<string, JsonSchema>;

const getConversationInputFields = {
  id: nonEmptyStringSchema("The Chorus conversation ID to retrieve."),
  fields: s.array("Chorus conversation fields to populate.", chorusConversationFieldSchema, {
    minItems: 1,
  }),
  forceRegeneration: s.boolean("Whether Chorus should regenerate the conversation from latest data."),
  skipSummaryGeneration: s.boolean("Whether Chorus should skip summary generation."),
  includeMeetingMetadata: s.boolean(
    "Whether Chorus should include meeting metadata such as provider calendar ID and meeting URL.",
  ),
} as const satisfies Record<string, JsonSchema>;

const listScorecardsInputFields = {
  recipientIds: integerArraySchema("IDs of Chorus users who were scored."),
  reviewerIds: integerArraySchema("IDs of Chorus users who completed scorecards."),
  initiativeId: s.integer("The Chorus initiative ID that scorecards were completed against."),
  submittedRange: nonEmptyStringSchema(
    "The submitted datetime range in Chorus format, such as 2021-01-01T00:00:00Z:2021-01-31T00:00:00Z.",
  ),
  pageSize: s.integer("The number of scorecards to return per page. Chorus allows 1 to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  pageNumber: s.integer("The one-indexed page of scorecards to return.", { minimum: 1 }),
} as const satisfies Record<string, JsonSchema>;

export const chorusActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get details about the current Chorus API token user.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The current Chorus user response.", {
      user: looseResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List Chorus teams visible to the connected API token user.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Chorus teams response.", {
      teams: s.array("The Chorus teams returned by the API.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Get a specific Chorus team by ID.",
    inputSchema: s.object("Input for getting a Chorus team.", {
      id: nonEmptyStringSchema("The Chorus team ID."),
    }),
    outputSchema: s.object("The Chorus team response.", {
      team: looseResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_engagements",
    description: "List Chorus engagements with documented v3 filters and continuation pagination.",
    inputSchema: s.object("Query parameters for listing Chorus engagements.", listEngagementsInputFields, {
      optional: optionalKeys(listEngagementsInputFields),
    }),
    outputSchema: s.object("The Chorus engagements response.", {
      engagements: s.array("The Chorus engagements returned by the API.", engagementSchema),
      continuationKey: s.nullable(s.string("The continuation key for the next page, if present.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    description: "Get a specific Chorus conversation with optional populated fields.",
    inputSchema: s.object("Input for getting a Chorus conversation.", getConversationInputFields, {
      optional: ["fields", "forceRegeneration", "skipSummaryGeneration", "includeMeetingMetadata"],
    }),
    outputSchema: s.object("The Chorus conversation response.", {
      conversation: looseResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_scorecards",
    description: "List Chorus scorecards with documented filters and page pagination.",
    inputSchema: s.object("Query parameters for listing Chorus scorecards.", listScorecardsInputFields, {
      optional: optionalKeys(listScorecardsInputFields),
    }),
    outputSchema: s.object("The Chorus scorecards response.", {
      scorecards: s.array("The Chorus scorecards returned by the API.", looseResourceSchema),
    }),
  }),
] as const;
