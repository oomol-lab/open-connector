import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fireflies";

const noInputSchema = s.object("No input is required for this action.", {});

const firefliesEmailSchema = s.email("A Fireflies email address.");
const nonEmptyString = (description: string) => s.nonEmptyString(description);
const optionalEmailArray = (description: string) => s.array(description, firefliesEmailSchema, { minItems: 1 });
const optionalIdArray = (description: string, itemDescription: string) =>
  s.array(description, s.string(itemDescription), { minItems: 1 });

const userGroupMemberSchema = s.looseRequiredObject(
  "A Fireflies user group member.",
  {
    user_id: s.string("The Fireflies user identifier."),
    first_name: s.string("The member first name."),
    last_name: s.string("The member last name."),
    email: s.string("The member email address."),
  },
  { optional: ["first_name", "last_name", "email"] },
);

const userGroupSchema = s.looseRequiredObject(
  "A Fireflies user group.",
  {
    id: s.string("The Fireflies user group identifier."),
    name: s.string("The Fireflies user group name."),
    handle: s.string("The Fireflies user group handle."),
    members: s.array("Members in the Fireflies user group.", userGroupMemberSchema),
  },
  { optional: ["name", "handle", "members"] },
);

const userSchema = s.looseRequiredObject(
  "A Fireflies user.",
  {
    user_id: s.string("The Fireflies user identifier."),
    email: s.string("The Fireflies user email address."),
    name: s.string("The Fireflies user full name."),
    is_admin: s.boolean("Whether the Fireflies user is an admin."),
    recent_meeting: s.string("The most recent meeting for the user."),
    recent_transcript: s.string("The most recent transcript for the user."),
    num_transcripts: s.integer("The number of transcripts for the user."),
    minutes_consumed: s.number("The meeting minutes consumed by the user."),
    integrations: s.stringArray("Integrations enabled for the Fireflies user.", {
      itemDescription: "A Fireflies integration name.",
    }),
    user_groups: s.array("User groups attached to the Fireflies user.", userGroupSchema),
  },
  {
    optional: [
      "email",
      "name",
      "is_admin",
      "recent_meeting",
      "recent_transcript",
      "num_transcripts",
      "minutes_consumed",
      "integrations",
      "user_groups",
    ],
  },
);

const userRoleSchema = s.looseRequiredObject(
  "A Fireflies user role update result.",
  {
    user_id: s.string("The Fireflies user identifier."),
    email: s.string("The Fireflies user email address."),
    name: s.string("The Fireflies user full name."),
    is_admin: s.boolean("Whether the Fireflies user is an admin."),
    recent_meeting: s.string("The most recent meeting for the user."),
    recent_transcript: s.string("The most recent transcript for the user."),
    num_transcripts: s.integer("The number of transcripts for the user."),
    minutes_consumed: s.number("The meeting minutes consumed by the user."),
    integrations: s.stringArray("Integrations enabled for the Fireflies user.", {
      itemDescription: "A Fireflies integration name.",
    }),
  },
  {
    optional: [
      "user_id",
      "email",
      "name",
      "is_admin",
      "recent_meeting",
      "recent_transcript",
      "num_transcripts",
      "minutes_consumed",
      "integrations",
    ],
  },
);

const channelMemberSchema = s.looseRequiredObject(
  "A Fireflies channel member.",
  {
    user_id: s.string("The Fireflies user identifier."),
    email: s.string("The member email address."),
    name: s.string("The member display name."),
  },
  { optional: ["email", "name"] },
);

const channelSchema = s.looseRequiredObject(
  "A Fireflies channel.",
  {
    id: s.string("The Fireflies channel identifier."),
    title: s.string("The Fireflies channel title."),
    is_private: s.boolean("Whether the Fireflies channel is private."),
    members: s.array("Members visible on the Fireflies channel.", channelMemberSchema),
  },
  { optional: ["title", "is_private", "members"] },
);

const meetingAttendeeSchema = s.looseRequiredObject(
  "A Fireflies meeting attendee.",
  {
    display_name: s.string("The attendee display name."),
    email: s.string("The attendee email address."),
    phone_number: s.string("The attendee phone number."),
  },
  { optional: ["display_name", "email", "phone_number"] },
);

const sentenceSchema = s.looseRequiredObject(
  "A Fireflies transcript sentence.",
  {
    speaker_name: s.string("The sentence speaker name."),
    text: s.string("The sentence transcript text."),
    start_time: s.number("The sentence start time in seconds."),
    end_time: s.number("The sentence end time in seconds."),
  },
  { optional: ["speaker_name", "text", "start_time", "end_time"] },
);

const summarySchema = s.looseRequiredObject(
  "A Fireflies transcript summary.",
  {
    overview: s.string("The transcript overview text."),
    notes: s.string("Detailed AI-generated transcript notes."),
    gist: s.string("A one-line transcript gist."),
    bullet_gist: s.string("A bullet summary of the meeting."),
    short_summary: s.string("A short summary paragraph."),
    short_overview: s.string("A short overview paragraph."),
    shorthand_bullet: s.string("Shorthand bullet summary text."),
    meeting_type: s.string("The Fireflies meeting type classification."),
    action_items: s.string("The AI-generated action items string."),
    keywords: s.stringArray("Transcript keywords.", { itemDescription: "A Fireflies keyword." }),
    topics_discussed: s.stringArray("Topics discussed in the transcript.", {
      itemDescription: "A topic discussed in the meeting.",
    }),
  },
  {
    optional: [
      "overview",
      "notes",
      "gist",
      "bullet_gist",
      "short_summary",
      "short_overview",
      "shorthand_bullet",
      "meeting_type",
      "action_items",
      "keywords",
      "topics_discussed",
    ],
  },
);

const transcriptSchema = s.looseRequiredObject(
  "A Fireflies transcript.",
  {
    id: s.string("The Fireflies transcript identifier."),
    title: s.string("The Fireflies transcript title."),
    date: s.number("The transcript timestamp in milliseconds since Unix epoch."),
    user: userSchema,
    summary: summarySchema,
    sentences: s.array("Transcript sentence details.", sentenceSchema),
    meeting_attendees: s.array("Meeting attendee details for the transcript.", meetingAttendeeSchema),
    channels: s.array("Channels linked to the transcript.", channelSchema),
  },
  { optional: ["title", "date", "user", "summary", "sentences", "meeting_attendees", "channels"] },
);

const biteUserSchema = s.looseRequiredObject(
  "A Fireflies bite creator.",
  {
    id: s.string("The Fireflies bite user identifier."),
    name: s.string("The Fireflies bite user display name."),
    picture: s.string("The bite user profile picture URL."),
    first_name: s.string("The bite user first name."),
    last_name: s.string("The bite user last name."),
  },
  { optional: ["id", "name", "picture", "first_name", "last_name"] },
);

const biteSourceSchema = s.looseRequiredObject(
  "A Fireflies bite media source.",
  {
    src: s.string("The bite media source URL."),
    type: s.string("The bite media source type."),
  },
  { optional: ["type"] },
);

const biteCaptionSchema = s.looseRequiredObject(
  "A Fireflies bite caption.",
  {
    index: s.oneOf([s.integer("A numeric caption position index."), s.string("A string caption position index.")], {
      description: "The caption position index.",
    }),
    speaker_id: s.string("The caption speaker identifier."),
    speaker_name: s.string("The caption speaker name."),
    text: s.string("The caption text."),
    start_time: s.oneOf([s.number("A numeric caption start time."), s.string("A string caption start time.")], {
      description: "The caption start time.",
    }),
    end_time: s.oneOf([s.number("A numeric caption end time."), s.string("A string caption end time.")], {
      description: "The caption end time.",
    }),
  },
  { optional: ["index", "speaker_name", "text", "start_time", "end_time"] },
);

const biteCreatedFromSchema = s.looseRequiredObject(
  "The origin information for a Fireflies bite.",
  {
    id: s.string("The source identifier for the bite."),
    name: s.string("The source name for the bite."),
    type: s.string("The source type for the bite."),
    duration: s.number("The source duration for the bite in seconds."),
    description: s.string("The source description for the bite."),
  },
  { optional: ["id", "name", "type", "duration", "description"] },
);

const biteSchema = s.looseRequiredObject(
  "A Fireflies bite.",
  {
    id: s.string("The Fireflies bite identifier."),
    transcript_id: s.string("The Fireflies transcript identifier for the bite."),
    name: s.string("The Fireflies bite title."),
    user: biteUserSchema,
    status: s.string("The bite processing status."),
    preview: s.string("The bite preview URL."),
    sources: s.array("Media sources for the bite.", biteSourceSchema),
    summary: s.string("The bite summary text."),
    user_id: s.string("The Fireflies user identifier that created the bite."),
    captions: s.array("Captions for the bite.", biteCaptionSchema),
    end_time: s.number("The bite end time in seconds."),
    privacies: s.stringArray("Visibility settings for the bite.", { itemDescription: "A bite visibility setting." }),
    thumbnail: s.string("The bite thumbnail URL."),
    created_at: s.string("The bite creation timestamp."),
    media_type: s.string("The bite media type."),
    start_time: s.number("The bite start time in seconds."),
    created_from: biteCreatedFromSchema,
    summary_status: s.string("The bite summary generation status."),
  },
  {
    optional: [
      "name",
      "user",
      "status",
      "preview",
      "sources",
      "summary",
      "user_id",
      "captions",
      "end_time",
      "privacies",
      "thumbnail",
      "created_at",
      "media_type",
      "start_time",
      "created_from",
      "summary_status",
    ],
  },
);

const createBiteResultSchema = s.looseRequiredObject(
  "A Fireflies bite creation result.",
  {
    id: s.string("The created Fireflies bite identifier."),
    name: s.string("The created Fireflies bite title."),
    status: s.string("The created Fireflies bite status."),
  },
  { optional: ["name", "status"] },
);

const aiAppOutputSchema = s.looseRequiredObject(
  "A Fireflies AI app output.",
  {
    title: s.string("The meeting title for the AI app output."),
    app_id: s.string("The Fireflies AI app identifier."),
    prompt: s.string("The prompt sent to the AI app."),
    user_id: s.string("The Fireflies user identifier for the AI app output."),
    response: s.string("The AI app response text."),
    created_at: s.string("The AI app output creation timestamp."),
    transcript_id: s.string("The Fireflies transcript identifier."),
  },
  { optional: ["title", "app_id", "prompt", "user_id", "response", "created_at", "transcript_id"] },
);

const askFredMessageSchema = s.looseRequiredObject(
  "A Fireflies AskFred message.",
  {
    id: s.string("The AskFred message identifier."),
    error: s.string("The AskFred message error text."),
    query: s.string("The AskFred message query text."),
    answer: s.string("The AskFred message answer text."),
    status: s.string("The AskFred message status."),
    thread_id: s.string("The AskFred thread identifier."),
    created_at: s.string("The AskFred message creation timestamp."),
    updated_at: s.string("The AskFred message update timestamp."),
    suggested_queries: s.stringArray("Suggested AskFred follow-up queries.", {
      itemDescription: "An AskFred suggested follow-up query.",
    }),
  },
  {
    optional: [
      "id",
      "error",
      "query",
      "answer",
      "status",
      "thread_id",
      "created_at",
      "updated_at",
      "suggested_queries",
    ],
  },
);

const askFredThreadSchema = s.looseRequiredObject(
  "A Fireflies AskFred thread.",
  {
    id: s.string("The AskFred thread identifier."),
    title: s.string("The AskFred thread title."),
    user_id: s.string("The AskFred thread creator identifier."),
    created_at: s.string("The AskFred thread creation timestamp."),
    transcript_id: s.string("The AskFred transcript identifier."),
  },
  { optional: ["id", "title", "user_id", "created_at", "transcript_id"] },
);

const askFredThreadDetailSchema = s.looseRequiredObject(
  "A Fireflies AskFred thread with messages.",
  {
    id: s.string("The AskFred thread identifier."),
    title: s.string("The AskFred thread title."),
    user_id: s.string("The AskFred thread creator identifier."),
    created_at: s.string("The AskFred thread creation timestamp."),
    transcript_id: s.string("The AskFred transcript identifier."),
    messages: s.array("Messages returned for the AskFred thread.", askFredMessageSchema),
  },
  { optional: ["id", "title", "user_id", "created_at", "transcript_id", "messages"] },
);

const meetingMutationSchema = s.looseRequiredObject(
  "A Fireflies meeting mutation result.",
  {
    id: s.string("The Fireflies transcript identifier."),
    title: s.string("The Fireflies transcript title."),
    privacy: s.string("The Fireflies transcript privacy value."),
  },
  { optional: ["title", "privacy"] },
);

const updatedMeetingSchema = s.looseRequiredObject(
  "An updated Fireflies meeting.",
  {
    id: s.string("The Fireflies transcript identifier."),
    title: s.string("The Fireflies transcript title."),
    channels: s.array("Channels linked to the updated meeting.", channelSchema),
  },
  { optional: ["title", "channels"] },
);

const deletedTranscriptSchema = s.looseRequiredObject(
  "A deleted Fireflies transcript.",
  {
    id: s.string("The deleted Fireflies transcript identifier."),
    date: s.number("The deleted transcript timestamp in milliseconds since Unix epoch."),
    title: s.string("The deleted transcript title."),
    duration: s.number("The deleted transcript duration."),
    audio_url: s.string("The deleted transcript audio URL."),
    video_url: s.string("The deleted transcript video URL."),
    host_email: s.string("The deleted transcript host email address."),
    participants: s.stringArray("Participant email addresses on the deleted transcript.", {
      itemDescription: "A deleted transcript participant email address.",
    }),
    transcript_url: s.string("The deleted transcript dashboard URL."),
    fireflies_users: s.stringArray("Fireflies users linked to the deleted transcript.", {
      itemDescription: "A Fireflies user linked to the deleted transcript.",
    }),
    organizer_email: s.string("The deleted transcript organizer email address."),
  },
  {
    optional: [
      "id",
      "date",
      "title",
      "duration",
      "audio_url",
      "video_url",
      "host_email",
      "participants",
      "transcript_url",
      "fireflies_users",
      "organizer_email",
    ],
  },
);

const graphqlErrorLocationSchema = s.looseRequiredObject(
  "A GraphQL error location.",
  {
    line: s.integer("The GraphQL error line number."),
    column: s.integer("The GraphQL error column number."),
  },
  { optional: ["line", "column"] },
);

const graphqlErrorSchema = s.looseRequiredObject(
  "A Fireflies GraphQL error.",
  {
    message: s.string("The GraphQL error message."),
    code: s.string("The GraphQL error code."),
    friendly: s.boolean("Whether the GraphQL error is safe to display."),
    path: s.array(
      "Path segments for the GraphQL error.",
      s.oneOf([s.string("A string path segment."), s.integer("A numeric path segment.")], {
        description: "A GraphQL error path segment.",
      }),
    ),
    locations: s.array("Locations for the GraphQL error.", graphqlErrorLocationSchema),
    extensions: s.record(true, { description: "Extensions attached to the GraphQL error." }),
  },
  { optional: ["message", "code", "friendly", "path", "locations", "extensions"] },
);

const userOutputSchema = s.requiredObject("The Fireflies user response.", {
  user: userSchema,
});
const usersOutputSchema = s.requiredObject("The Fireflies users response.", {
  users: s.array("Fireflies users returned by the request.", userSchema),
});
const channelsOutputSchema = s.requiredObject("The Fireflies channels response.", {
  channels: s.array("Fireflies channels returned by the request.", channelSchema),
});
const userGroupsOutputSchema = s.requiredObject("The Fireflies user groups response.", {
  user_groups: s.array("Fireflies user groups returned by the request.", userGroupSchema),
});
const transcriptsOutputSchema = s.requiredObject("The Fireflies transcripts response.", {
  transcripts: s.array("Fireflies transcripts returned by the request.", transcriptSchema),
});
const transcriptOutputSchema = s.requiredObject("The Fireflies transcript response.", {
  transcript: transcriptSchema,
});
const bitesOutputSchema = s.requiredObject("The Fireflies bites response.", {
  bites: s.array("Fireflies bites returned by the request.", biteSchema),
});
const biteOutputSchema = s.requiredObject("The Fireflies bite response.", {
  bite: biteSchema,
});
const createBiteOutputSchema = s.requiredObject("The Fireflies create bite response.", {
  bite: createBiteResultSchema,
});
const aiAppOutputsOutputSchema = s.requiredObject("The Fireflies AI app outputs response.", {
  outputs: s.array("Fireflies AI app outputs returned by the request.", aiAppOutputSchema),
});
const askFredThreadsOutputSchema = s.requiredObject("The Fireflies AskFred threads response.", {
  askfred_threads: s.array("Fireflies AskFred threads returned by the request.", askFredThreadSchema),
});
const askFredThreadOutputSchema = s.requiredObject("The Fireflies AskFred thread response.", {
  askfred_thread: askFredThreadDetailSchema,
});
const askFredMessageOutputSchema = s.requiredObject("The Fireflies AskFred message response.", {
  message: askFredMessageSchema,
});
const setUserRoleOutputSchema = s.requiredObject("The Fireflies set user role response.", {
  user: userRoleSchema,
});
const updateMeetingChannelOutputSchema = s.requiredObject("The Fireflies update meeting channel response.", {
  updated_meetings: s.array("Meetings returned by the Fireflies channel update mutation.", updatedMeetingSchema),
});
const meetingOutputSchema = s.requiredObject("The Fireflies meeting mutation response.", {
  meeting: meetingMutationSchema,
});
const deleteTranscriptOutputSchema = s.requiredObject("The Fireflies delete transcript response.", {
  deleted_transcript: deletedTranscriptSchema,
});
const executeGraphqlQueryOutputSchema = s.object(
  "The raw Fireflies GraphQL query response.",
  {
    data: s.nullable(s.unknown("The raw Fireflies GraphQL data payload.")),
    errors: s.array("GraphQL errors returned by the Fireflies query.", graphqlErrorSchema),
    extensions: s.record(true, { description: "Additional metadata returned by the Fireflies GraphQL response." }),
  },
  { optional: ["data", "errors", "extensions"] },
);

const getUserInputSchema = s.requiredObject("Input parameters for reading a Fireflies user by ID.", {
  user_id: nonEmptyString("The Fireflies user identifier to fetch."),
});

const listUserGroupsInputSchema = s.object(
  "Input parameters for listing Fireflies user groups.",
  {
    mine: s.boolean("Whether to return only user groups that include the current user."),
  },
  { optional: ["mine"] },
);

const listTranscriptsInputSchema = s.looseRequiredObject(
  "Input parameters for listing Fireflies transcripts.",
  {
    skip: s.integer("The number of Fireflies transcripts to skip before returning results."),
    limit: s.integer("The maximum number of Fireflies transcripts to return.", { minimum: 1, maximum: 50 }),
    title: nonEmptyString("The meeting title filter."),
    user_id: nonEmptyString("The Fireflies user identifier used to filter transcripts."),
    from_date: s.dateTime("Inclusive start datetime for transcript filtering."),
    to_date: s.dateTime("Inclusive end datetime for transcript filtering."),
    host_email: s.email("The host email address filter."),
    organizers: optionalEmailArray("Organizer email addresses used to filter transcripts."),
    participants: optionalEmailArray("Participant email addresses used to filter transcripts."),
    channel_id: nonEmptyString("The Fireflies channel identifier used to filter transcripts."),
    include_summary: s.boolean("Whether to include transcript summary data."),
    include_analytics: s.boolean("Whether to include transcript analytics data."),
    include_audio_url: s.boolean("Whether to include the transcript audio URL."),
    include_video_url: s.boolean("Whether to include the transcript video URL."),
    include_sentences: s.boolean("Whether to include transcript sentences."),
    include_apps_preview: s.boolean("Whether to include transcript app preview data."),
    include_user_details: s.boolean("Whether to include detailed user information."),
    include_meeting_attendees: s.boolean("Whether to include meeting attendees."),
    include_meeting_attendance: s.boolean("Whether to include meeting attendance details."),
  },
  {
    optional: [
      "skip",
      "limit",
      "title",
      "user_id",
      "from_date",
      "to_date",
      "host_email",
      "organizers",
      "participants",
      "channel_id",
      "include_summary",
      "include_analytics",
      "include_audio_url",
      "include_video_url",
      "include_sentences",
      "include_apps_preview",
      "include_user_details",
      "include_meeting_attendees",
      "include_meeting_attendance",
    ],
  },
);

const getTranscriptInputSchema = s.requiredObject("Input parameters for reading a Fireflies transcript by ID.", {
  id: nonEmptyString("The Fireflies transcript identifier."),
});

const getBiteInputSchema = s.requiredObject("Input parameters for reading a Fireflies bite by ID.", {
  id: nonEmptyString("The Fireflies bite identifier."),
});

const getAskFredThreadInputSchema = s.requiredObject("Input parameters for reading a Fireflies AskFred thread by ID.", {
  id: nonEmptyString("The Fireflies AskFred thread identifier."),
});

const deleteAskFredThreadInputSchema = s.requiredObject("Input parameters for deleting a Fireflies AskFred thread.", {
  id: nonEmptyString("The Fireflies AskFred thread identifier."),
});

const deleteTranscriptInputSchema = s.requiredObject("Input parameters for deleting a Fireflies transcript.", {
  id: nonEmptyString("The Fireflies transcript identifier."),
});

const listBitesInputSchema = s.object(
  "Input parameters for listing Fireflies bites.",
  {
    mine: s.boolean("Whether to return only bites created by the current user."),
    my_team: s.boolean("Whether to return bites created by the current team."),
    transcript_id: nonEmptyString("The Fireflies transcript identifier used to filter bites."),
    skip: s.integer("The number of bites to skip before returning results."),
    limit: s.integer("The maximum number of Fireflies bites to return.", { minimum: 1 }),
  },
  { optional: ["mine", "my_team", "transcript_id", "skip", "limit"] },
);

const createBiteInputSchema = s.object(
  "Input parameters for creating a Fireflies bite.",
  {
    transcript_id: nonEmptyString("The Fireflies transcript identifier used to create the bite."),
    start_time: s.number("The bite start time in seconds.", { minimum: 0 }),
    end_time: s.number("The bite end time in seconds.", { minimum: 0 }),
    name: s.string("The name for the created bite.", { minLength: 1, maxLength: 256 }),
    summary: s.string("The summary for the created bite.", { minLength: 1, maxLength: 500 }),
    media_type: s.stringEnum("The media type to create for the bite.", ["video", "audio"]),
    privacies: s.array(
      "Visibility settings for the created bite.",
      s.stringEnum("A bite visibility setting.", ["public", "team", "participants"]),
      { minItems: 1 },
    ),
  },
  { optional: ["name", "summary", "media_type", "privacies"] },
);

const listAiAppOutputsInputSchema = s.object(
  "Input parameters for listing Fireflies AI app outputs.",
  {
    app_id: nonEmptyString("The Fireflies AI app identifier used to filter outputs."),
    transcript_id: nonEmptyString("The Fireflies transcript identifier used to filter AI app outputs."),
    skip: s.integer("The number of AI app outputs to skip before returning results."),
    limit: s.integer("The maximum number of AI app outputs to return.", { minimum: 1 }),
  },
  { optional: ["app_id", "transcript_id", "skip", "limit"] },
);

const askFredFilterSchema = s.looseRequiredObject(
  "Meeting filters for Fireflies AskFred queries.",
  {
    start_time: s.dateTime("Inclusive start datetime for AskFred meeting filters."),
    end_time: s.dateTime("Inclusive end datetime for AskFred meeting filters."),
    organizers: optionalEmailArray("Organizer email addresses used to filter AskFred meetings."),
    participants: optionalEmailArray("Participant email addresses used to filter AskFred meetings."),
    channel_ids: optionalIdArray(
      "Channel identifiers used to filter AskFred meetings.",
      "A Fireflies channel identifier.",
    ),
    transcript_ids: optionalIdArray(
      "Transcript identifiers used to filter AskFred meetings.",
      "A Fireflies transcript identifier.",
    ),
  },
  { optional: ["start_time", "end_time", "organizers", "participants", "channel_ids", "transcript_ids"] },
);

const listAskFredThreadsInputSchema = s.object(
  "Input parameters for listing Fireflies AskFred threads.",
  {
    transcript_id: nonEmptyString("The Fireflies transcript identifier used to filter AskFred threads."),
  },
  { optional: ["transcript_id"] },
);

const createAskFredThreadInputSchema = s.object(
  "Input parameters for creating a Fireflies AskFred thread.",
  {
    query: s.string("The AskFred query to execute.", { minLength: 1, maxLength: 2000 }),
    transcript_id: nonEmptyString("The Fireflies transcript identifier used for a single-meeting AskFred query."),
    filters: askFredFilterSchema,
    response_language: s.string("The AskFred response language code.", { minLength: 1 }),
    format_mode: s.stringEnum("The AskFred response format.", ["markdown", "plaintext"]),
  },
  { optional: ["transcript_id", "filters", "response_language", "format_mode"] },
);

const continueAskFredThreadInputSchema = s.object(
  "Input parameters for continuing a Fireflies AskFred thread.",
  {
    thread_id: nonEmptyString("The Fireflies AskFred thread identifier."),
    query: s.string("The follow-up AskFred query to execute.", { minLength: 1, maxLength: 2000 }),
    response_language: s.string("The AskFred response language code.", { minLength: 1 }),
    format_mode: s.stringEnum("The AskFred response format.", ["markdown", "plaintext"]),
  },
  { optional: ["response_language", "format_mode"] },
);

const setUserRoleInputSchema = s.requiredObject("Input parameters for updating a Fireflies user role.", {
  user_id: nonEmptyString("The Fireflies user identifier to update."),
  role: s.stringEnum("The Fireflies role to set for the user.", ["admin", "user"]),
});

const updateMeetingChannelInputSchema = s.requiredObject(
  "Input parameters for updating the channel on Fireflies meetings.",
  {
    transcript_ids: s.array(
      "Transcript identifiers to update in the channel mutation.",
      s.string("A Fireflies transcript identifier."),
      { minItems: 1, maxItems: 5 },
    ),
    channel_id: nonEmptyString("The Fireflies channel identifier to assign to the meetings."),
  },
);

const updateMeetingPrivacyInputSchema = s.requiredObject("Input parameters for updating Fireflies meeting privacy.", {
  id: nonEmptyString("The Fireflies transcript identifier to update."),
  privacy: s.stringEnum("The Fireflies privacy value to set on the meeting.", [
    "link",
    "owner",
    "participants",
    "teammatesandparticipants",
    "teammates",
  ]),
});

const updateMeetingTitleInputSchema = s.requiredObject("Input parameters for updating a Fireflies meeting title.", {
  id: nonEmptyString("The Fireflies transcript identifier to update."),
  title: nonEmptyString("The new Fireflies meeting title."),
});

const executeGraphqlQueryInputSchema = s.object(
  "Input parameters for executing a raw Fireflies GraphQL query.",
  {
    query: nonEmptyString("The Fireflies GraphQL query document."),
    variables: s.record(true, { description: "GraphQL variables used with the query document." }),
    operationName: nonEmptyString("The GraphQL operation name to execute."),
  },
  { optional: ["variables", "operationName"] },
);

export const firefliesActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Fireflies user for the current API key.",
    inputSchema: noInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a Fireflies user by user ID.",
    inputSchema: getUserInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Fireflies users visible to the current API key.",
    inputSchema: noInputSchema,
    outputSchema: usersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_channels",
    description: "List Fireflies channels visible to the current API key.",
    inputSchema: noInputSchema,
    outputSchema: channelsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_user_groups",
    description: "List Fireflies user groups visible to the current API key.",
    inputSchema: listUserGroupsInputSchema,
    outputSchema: userGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_transcripts",
    description: "List Fireflies transcripts with official filters and include flags.",
    inputSchema: listTranscriptsInputSchema,
    outputSchema: transcriptsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_transcript",
    description: "Get a Fireflies transcript by transcript ID.",
    inputSchema: getTranscriptInputSchema,
    outputSchema: transcriptOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_bites",
    description: "List Fireflies bites using the available bite filters.",
    inputSchema: listBitesInputSchema,
    outputSchema: bitesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bite",
    description: "Get a Fireflies bite by bite ID.",
    inputSchema: getBiteInputSchema,
    outputSchema: biteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_bite",
    description: "Create a Fireflies bite from a transcript time range.",
    inputSchema: createBiteInputSchema,
    outputSchema: createBiteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_ai_app_outputs",
    description: "List Fireflies AI app outputs for transcripts or app IDs.",
    inputSchema: listAiAppOutputsInputSchema,
    outputSchema: aiAppOutputsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_askfred_threads",
    description: "List Fireflies AskFred conversation threads.",
    inputSchema: listAskFredThreadsInputSchema,
    outputSchema: askFredThreadsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_askfred_thread",
    description: "Get a Fireflies AskFred thread by thread ID.",
    inputSchema: getAskFredThreadInputSchema,
    outputSchema: askFredThreadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_askfred_thread",
    description: "Create a Fireflies AskFred thread from a meeting question.",
    inputSchema: createAskFredThreadInputSchema,
    outputSchema: askFredMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "continue_askfred_thread",
    description: "Continue a Fireflies AskFred thread with a follow-up question.",
    inputSchema: continueAskFredThreadInputSchema,
    outputSchema: askFredMessageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_askfred_thread",
    description: "Delete a Fireflies AskFred thread by thread ID.",
    inputSchema: deleteAskFredThreadInputSchema,
    outputSchema: s.requiredObject("The Fireflies delete AskFred thread response.", {
      askfred_thread: askFredThreadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "set_user_role",
    description: "Set a Fireflies user's role to admin or user.",
    inputSchema: setUserRoleInputSchema,
    outputSchema: setUserRoleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_meeting_channel",
    description: "Update the Fireflies channel assignments for one or more meetings.",
    inputSchema: updateMeetingChannelInputSchema,
    outputSchema: updateMeetingChannelOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_meeting_privacy",
    description: "Update the privacy value for a Fireflies meeting.",
    inputSchema: updateMeetingPrivacyInputSchema,
    outputSchema: meetingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_meeting_title",
    description: "Update the title for a Fireflies meeting.",
    inputSchema: updateMeetingTitleInputSchema,
    outputSchema: meetingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_transcript",
    description: "Delete a Fireflies transcript by transcript ID.",
    inputSchema: deleteTranscriptInputSchema,
    outputSchema: deleteTranscriptOutputSchema,
  }),
  defineProviderAction(service, {
    name: "execute_graphql_query",
    description: "Execute a raw read-only Fireflies GraphQL query and return the raw response.",
    inputSchema: executeGraphqlQueryInputSchema,
    outputSchema: executeGraphqlQueryOutputSchema,
  }),
];

export type FirefliesActionName =
  | "get_current_user"
  | "get_user"
  | "list_users"
  | "list_channels"
  | "list_user_groups"
  | "list_transcripts"
  | "get_transcript"
  | "list_bites"
  | "get_bite"
  | "create_bite"
  | "list_ai_app_outputs"
  | "list_askfred_threads"
  | "get_askfred_thread"
  | "create_askfred_thread"
  | "continue_askfred_thread"
  | "delete_askfred_thread"
  | "set_user_role"
  | "update_meeting_channel"
  | "update_meeting_privacy"
  | "update_meeting_title"
  | "delete_transcript"
  | "execute_graphql_query";
