import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clari_copilot";

const optionalTimestampSchema = (description: string): JsonSchema =>
  s.nonEmptyString(`${description} Use the date-time format accepted by the Clari Copilot API.`);

const callStatusSchema = s.stringEnum("A Clari Copilot call status.", [
  "SCHEDULED",
  "INITIATED",
  "INPROGRESS",
  "WAITING_IN_QUEUE",
  "PROCESSING",
  "PROCESSED",
  "ERROR_IN_TRANSCRIBE",
  "ERROR_IN_PROCESSING",
  "ERROR_IN_RECORDING",
  "UNABLE_TO_JOIN",
  "CALL_DID_NOT_HAPPEN",
  "IGNORED_BY_USER",
  "BOTJOIN_DISABLED",
  "POST_PROCESSING_DONE",
  "NO_DATA_INCALL",
  "NOBODY_JOINED_CALL",
  "BOTJOIN_DENIED",
]);

const callTypeSchema = s.stringEnum("A Clari Copilot call source type.", [
  "ZOOM",
  "GOOGLE_MEET",
  "FRESHCALLER",
  "AIRCALL_RECORDING",
  "RINGCENTRAL",
  "GOTO_MEETING",
  "OUTREACH",
  "HUBSPOT",
  "BLUE_JEANS",
  "SALESLOFT",
  "MS_TEAMS",
  "DIALPAD",
  "FRONTSPIN",
  "TALKDESK",
]);

const callDispositionSchema = s.stringEnum("A Clari Copilot call disposition.", [
  "UNKNOWN_CALL_DISPOSITION",
  "CALL_CONNECTED_WITH_PROSPECT",
  "CALL_DID_NOT_CONNECT_WITH_PROSPECT",
  "CALL_NOBODY_JOINED",
  "CALL_BOTJOIN_DENIED",
]);

const botNotJoinReasonSchema = s.stringEnum("A reason why the Clari Copilot bot did not join.", [
  "IGNORED_DUE_TO_WHITELIST",
  "CONSENT_REVOKED",
  "IGNORED_BY_USER",
  "IGNORED_CALL_TYPE_IGNORED_BY_CUSTOMER",
  "IGNORED_NO_USER_HAS_ACCEPTED_INVITE",
  "RECORDING_PERMISSION_DENIED",
  "IGNORED_NON_MEETING",
  "IGNORED_NOT_CONFIRMED",
  "IGNORED_NOT_EXTERNAL_MEETING",
  "IGNORED_NOT_ORGANIZER",
  "IGNORED",
]);

const sortDirectionSchema = s.stringEnum("Sort direction.", ["asc", "desc"]);

const paginationSchema = s.looseObject("Pagination information returned by Clari Copilot.", {
  matched: s.integer("The number of records matching the query."),
  hasMore: s.boolean("Whether more records are available."),
  nextPageSkip: s.integer("The skip value for the next page."),
});

const userSchema = s.looseObject("A Clari Copilot user.", {
  id: s.string("The user ID."),
  email: s.string("The user email address."),
  name: s.string("The user's display name."),
  role: s.stringEnum("The user's Clari Copilot role.", ["REP", "MANAGER", "OBSERVER"]),
  is_recording: s.boolean("Whether calls for this user are recorded."),
  manager_id: s.string("The user's manager ID."),
});

const topicSchema = s.looseObject("A Clari Copilot topic.", {
  topic_id: s.string("The topic ID."),
  topic_name: s.string("The topic name."),
  type: s.string("The topic type."),
  team_ids: s.array("Team IDs associated with the topic.", s.string("A team ID.")),
  custom_topic: s.looseObject("Custom topic details.", {
    description: s.string("The custom topic description."),
    status: s.string("The custom topic status."),
  }),
  keyword_topic: s.looseObject("Keyword topic details.", {
    trackers: s.array("Keyword trackers associated with the topic.", s.string("A tracker.")),
  }),
});

const callUserSchema = s.looseObject("A Clari Copilot user on a call.", {
  userId: s.string("The Clari Copilot user ID."),
  userEmail: s.string("The Clari Copilot user email."),
  isOrganizer: s.boolean("Whether the user organized the call."),
  personId: s.integer("The participant person ID in the call transcript."),
});

const callParticipantSchema = s.looseObject("An external Clari Copilot call participant.", {
  name: s.string("The participant name."),
  email: s.string("The participant email."),
  phone: s.string("The participant phone number."),
  personId: s.integer("The participant person ID in the call transcript."),
});

const callMetricsSchema = s.looseObject("Clari Copilot call metrics.", {
  talk_listen_ratio: s.number("Talk-listen ratio for the call."),
  num_questions_asked: s.integer("Number of questions asked during the call."),
  num_questions_asked_by_reps: s.integer("Number of questions asked by reps."),
  call_duration: s.integer("Call duration in seconds."),
  total_speak_duration: s.number("Total speak duration in seconds."),
  longest_monologue_duration: s.number("Longest monologue duration in seconds."),
  longest_monologue_start_time: s.number("Start time of the longest monologue in seconds."),
  engaging_questions: s.integer("Number of engaging questions."),
  categories: s.array("Metric categories returned by Clari Copilot.", s.looseObject("A category.")),
});

const crmInfoSchema = s.looseObject("CRM metadata associated with a Clari Copilot call.", {
  source_crm: s.string("The source CRM name."),
  deal_id: s.string("The CRM deal ID."),
  account_id: s.string("The CRM account ID."),
  contact_ids: s.array("CRM contact IDs.", s.string("A CRM contact ID.")),
});

const callProperties: Record<string, JsonSchema> = {
  id: s.string("The call ID."),
  source_id: s.string("The source call ID."),
  title: s.string("The call title."),
  users: s.array("Internal Clari Copilot users on the call.", callUserSchema),
  externalParticipants: s.array("External call participants.", callParticipantSchema),
  joinedParticipants: s.array("Participants that joined the call.", s.looseObject("A joined participant.")),
  status: callStatusSchema,
  bot_not_join_reason: s.array("Reasons why the bot did not join.", botNotJoinReasonSchema),
  type: callTypeSchema,
  time: s.string("The call scheduled or start time."),
  icaluid: s.string("The calendar iCal UID."),
  calendar_id: s.string("The calendar ID."),
  recurring_event_id: s.string("The recurring event ID."),
  original_start_time: s.string("The original call start time."),
  last_modified_time: s.string("The last time the call was modified."),
  audio_url: s.string("A signed audio URL when requested and available."),
  video_url: s.string("A signed video URL when requested and available."),
  disposition: callDispositionSchema,
  deal_name: s.string("The associated deal name."),
  deal_value: s.string("The associated deal value."),
  deal_close_date: s.string("The associated deal close date."),
  deal_stage_before_call: s.string("The deal stage before the call."),
  account_name: s.string("The associated account name."),
  contact_names: s.array("Associated contact names.", s.string("A contact name.")),
  crm_info: crmInfoSchema,
  bookmark_timestamps: s.array("Bookmark timestamps.", s.string("A bookmark timestamp.")),
  metrics: callMetricsSchema,
  call_review_page_url: s.string("The Clari Copilot call review page URL."),
};

const callSchema = s.looseObject("A Clari Copilot call.", callProperties);

const transcriptTurnSchema = s.looseObject("A Clari Copilot transcript turn.", {
  text: s.string("The transcript text."),
  start: s.number("The turn start time in seconds."),
  end: s.number("The turn end time in seconds."),
  personId: s.integer("The participant person ID."),
  annotations: s.array("Transcript annotations.", s.looseObject("A transcript annotation.")),
});

const summaryTopicSchema = s.looseObject("A Clari Copilot summary topic.", {
  name: s.string("The topic name."),
  start_timestamp: s.string("The topic start timestamp."),
  end_timestamp: s.string("The topic end timestamp."),
  summary: s.string("The topic summary."),
});

const summaryActionItemSchema = s.looseObject("A Clari Copilot summary action item.", {
  action_item: s.string("The action item text."),
  speaker_name: s.string("The speaker name."),
  start_timestamp: s.string("The action item start timestamp."),
  end_timestamp: s.string("The action item end timestamp."),
});

const callDetailsSchema = s.looseObject("Detailed Clari Copilot call information.", {
  ...callProperties,
  deal_stage_live: s.string("The live deal stage."),
  transcript: s.array("Call transcript turns.", transcriptTurnSchema),
  summary: s.looseObject("Call summary returned by Clari Copilot.", {
    full_summary: s.string("The full call summary."),
    topics_discussed: s.array("Topics discussed in the call.", summaryTopicSchema),
    key_action_items: s.array("Key action items from the call.", summaryActionItemSchema),
  }),
  competitor_sentiments: s.array(
    "Competitor sentiment details returned by Clari Copilot.",
    s.looseObject("A competitor sentiment item."),
  ),
});

const scorecardQuestionSchema = s.looseObject("A Clari Copilot scorecard question score.", {
  score: s.integer("The score for the question."),
  skill: s.string("The assessed skill."),
  label: s.string("The question label."),
  order: s.string("The question order."),
});

const scorecardSchema = s.looseObject("A Clari Copilot scorecard.", {
  id: s.string("The scorecard ID."),
  type: s.string("The scorecard type."),
  rep: s.string("The scored rep ID."),
  scorer: s.string("The scorer ID."),
  template_id: s.string("The scorecard template ID."),
  call_id: s.string("The scored call ID."),
  total_score: s.number("The total score."),
  remark: s.string("Additional remarks or comments on the scorecard."),
  questions_score: s.array("Question-level scores.", scorecardQuestionSchema),
});

const listTopicsInputSchema = s.object(
  "Input parameters for listing Clari Copilot topics.",
  {
    filterModifiedLt: optionalTimestampSchema("Return topics modified before this timestamp."),
    filterModifiedGt: optionalTimestampSchema("Return topics modified after this timestamp."),
  },
  { optional: ["filterModifiedLt", "filterModifiedGt"] },
);

const listCallsInputSchema = s.object(
  "Input parameters for listing Clari Copilot calls.",
  {
    skip: s.integer("The number of calls to skip.", { minimum: 0, maximum: 10000 }),
    limit: s.integer("The number of calls to return.", { minimum: 1, maximum: 100 }),
    filterUser: s.array("Filter calls by Clari Copilot user email.", s.email("A user email."), { minItems: 1 }),
    filterAttendees: s.array("Filter calls by external attendee email.", s.email("An attendee email."), {
      minItems: 1,
    }),
    filterTopics: s.array("Filter calls by topic name.", s.nonEmptyString("A topic name."), { minItems: 1 }),
    filterStatus: s.array("Filter calls by status.", callStatusSchema, { minItems: 1 }),
    filterType: s.array("Filter calls by source type.", callTypeSchema, { minItems: 1 }),
    filterSourceId: s.array("Filter calls by source IDs.", s.nonEmptyString("A source ID."), { minItems: 1 }),
    filterTimeGt: optionalTimestampSchema("Return calls scheduled or started after this time."),
    filterTimeLt: optionalTimestampSchema("Return calls scheduled or started before this time."),
    filterModifiedGt: optionalTimestampSchema("Return calls modified after this time."),
    filterModifiedLt: optionalTimestampSchema("Return calls modified before this time."),
    filterDurationGt: s.integer("Return calls longer than this duration in seconds.", {
      minimum: 0,
      maximum: 7200,
    }),
    filterDurationLt: s.integer("Return calls shorter than this duration in seconds.", {
      minimum: 0,
      maximum: 7200,
    }),
    sortTime: sortDirectionSchema,
    sortProcessed: sortDirectionSchema,
    includePrivate: s.boolean("Whether private calls should be included."),
    includeAudio: s.boolean("Whether signed audio URLs should be included."),
    includeVideo: s.boolean("Whether signed video URLs should be included."),
    includePagination: s.boolean("Whether pagination metadata should be included."),
  },
  {
    optional: [
      "skip",
      "limit",
      "filterUser",
      "filterAttendees",
      "filterTopics",
      "filterStatus",
      "filterType",
      "filterSourceId",
      "filterTimeGt",
      "filterTimeLt",
      "filterModifiedGt",
      "filterModifiedLt",
      "filterDurationGt",
      "filterDurationLt",
      "sortTime",
      "sortProcessed",
      "includePrivate",
      "includeAudio",
      "includeVideo",
      "includePagination",
    ],
  },
);

const getCallDetailsInputSchema = s.object(
  "Input parameters for retrieving one Clari Copilot call.",
  {
    id: s.nonEmptyString("The Clari Copilot call ID."),
    includeAudio: s.boolean("Whether a signed audio URL should be included."),
    includeVideo: s.boolean("Whether a signed video URL should be included."),
  },
  { required: ["id"] },
);

const listScorecardsInputSchema = s.object(
  "Input parameters for listing Clari Copilot scorecards.",
  {
    skip: s.integer("The number of scorecards to skip.", { minimum: 0, maximum: 10000 }),
    limit: s.integer("The number of scorecards to return.", { minimum: 1, maximum: 100 }),
    filterTimeGt: optionalTimestampSchema("Return scorecards after this timestamp."),
    filterTimeLt: optionalTimestampSchema("Return scorecards before this timestamp."),
    filterRepId: s.nonEmptyString("Filter scorecards by scored rep user ID."),
    filterScorerId: s.nonEmptyString("Filter scorecards by scorer user ID."),
  },
  { optional: ["skip", "limit", "filterTimeGt", "filterTimeLt", "filterRepId", "filterScorerId"] },
);

export const clariCopilotActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List current users in the Clari Copilot workspace.",
    inputSchema: s.actionInput({}, [], "No input is required to list Clari Copilot users."),
    outputSchema: s.looseRequiredObject(
      "The Clari Copilot users response.",
      {
        users: s.array("Users returned by Clari Copilot.", userSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_topics",
    description: "List Clari Copilot topics, optionally filtered by last modified time.",
    inputSchema: listTopicsInputSchema,
    outputSchema: s.looseRequiredObject(
      "The Clari Copilot topics response.",
      {
        topics: s.array("Topics returned by Clari Copilot.", topicSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List Clari Copilot calls with supported filters, sorting, and pagination.",
    inputSchema: listCallsInputSchema,
    outputSchema: s.looseRequiredObject(
      "The Clari Copilot calls list response.",
      {
        calls: s.array("Calls returned by Clari Copilot.", callSchema),
        pagination: s.nullable(paginationSchema),
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_call_details",
    description: "Retrieve one Clari Copilot call with transcript, summary, and optional media URLs.",
    inputSchema: getCallDetailsInputSchema,
    outputSchema: s.looseRequiredObject(
      "The Clari Copilot call details response.",
      {
        call: callDetailsSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_scorecards",
    description: "List Clari Copilot scorecards with pagination and scorer filters.",
    inputSchema: listScorecardsInputSchema,
    outputSchema: s.looseRequiredObject(
      "The Clari Copilot scorecards response.",
      {
        scorecards: s.array("Scorecards returned by Clari Copilot.", scorecardSchema),
        pagination: s.nullable(paginationSchema),
      },
      { optional: ["pagination"] },
    ),
  }),
];
