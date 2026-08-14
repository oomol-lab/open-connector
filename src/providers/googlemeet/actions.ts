import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleMeetCreateScopes, googleMeetReadScopes, googleMeetSettingsScopes } from "./scopes.ts";

const service = "googlemeet";

interface GoogleMeetActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const autoGenerationType = s.stringEnum("Whether Google Meet should automatically generate the artifact.", [
  "AUTO_GENERATION_TYPE_UNSPECIFIED",
  "ON",
  "OFF",
]);

const recordingConfig = s.object("Automatic recording settings for the meeting space.", {
  autoRecordingGeneration: autoGenerationType,
});

const transcriptionConfig = s.object("Automatic transcription settings for the meeting space.", {
  autoTranscriptionGeneration: autoGenerationType,
});

const smartNotesConfig = s.object("Automatic smart-note settings for the meeting space.", {
  autoSmartNotesGeneration: autoGenerationType,
});

const artifactConfig = s.object("Automatic artifact generation settings for the meeting space.", {
  recordingConfig,
  transcriptionConfig,
  smartNotesConfig,
});

const restrictionType = s.stringEnum("Who can use the moderated meeting feature.", [
  "RESTRICTION_TYPE_UNSPECIFIED",
  "HOSTS_ONLY",
  "NO_RESTRICTION",
]);

const moderationRestrictions = s.object("Feature restrictions applied while moderation is enabled.", {
  chatRestriction: restrictionType,
  presentRestriction: restrictionType,
  reactionRestriction: restrictionType,
  defaultJoinAsViewerType: s.stringEnum("Whether participants join as viewers by default.", [
    "DEFAULT_JOIN_AS_VIEWER_TYPE_UNSPECIFIED",
    "ON",
    "OFF",
  ]),
});

const spaceConfig = s.object("Configuration for a Google Meet space.", {
  accessType: s.stringEnum("Who can join the meeting without knocking.", [
    "ACCESS_TYPE_UNSPECIFIED",
    "OPEN",
    "TRUSTED",
    "RESTRICTED",
  ]),
  entryPointAccess: s.stringEnum("Which entry points can join the meeting.", [
    "ENTRY_POINT_ACCESS_UNSPECIFIED",
    "ALL",
    "CREATOR_APP_ONLY",
  ]),
  moderation: s.stringEnum("Whether meeting moderation is enabled.", ["MODERATION_UNSPECIFIED", "OFF", "ON"]),
  moderationRestrictions,
  attendanceReportGenerationType: s.stringEnum("Whether the meeting generates an attendance report.", [
    "ATTENDANCE_REPORT_GENERATION_TYPE_UNSPECIFIED",
    "GENERATE_REPORT",
    "DO_NOT_GENERATE",
  ]),
  artifactConfig,
});

const spaceWrite = s.object("Writable Google Meet space fields.", {
  config: spaceConfig,
});

const activeConference = s.object("The conference currently active in the meeting space.", {
  conferenceRecord: s.nonEmptyString("The active conference record resource name."),
});

const phoneAccess = s.object("A regional dial-in option for the meeting space.", {
  regionCode: s.string("The regional country code."),
  phoneNumber: s.string("The E.164 phone number used to dial in."),
  pin: s.string("The numeric PIN entered after dialing."),
  languageCode: s.string("The language code associated with the dial-in option."),
});

const gatewaySipAccess = s.object("A SIP gateway option for joining the meeting space.", {
  uri: s.string("The SIP or SIPS URI used to join."),
  sipAccessCode: s.string("The numeric SIP access code."),
});

const space = s.object(
  "A Google Meet meeting space.",
  {
    name: s.nonEmptyString("The resource name, in the form spaces/{space}."),
    meetingUri: s.url("The URL participants use to join the meeting."),
    meetingCode: s.string("The human-readable meeting code."),
    config: spaceConfig,
    activeConference,
    phoneAccess: s.array("Regional phone dial-in options.", phoneAccess),
    gatewaySipAccess: s.array("SIP gateway access options.", gatewaySipAccess),
  },
  { required: ["name"], additionalProperties: true },
);

const conferenceRecord = s.object(
  "One instance of a conference held in a Google Meet space.",
  {
    name: s.nonEmptyString("The conference record resource name."),
    space: s.string("The meeting space resource name."),
    startTime: s.dateTime("When the conference started."),
    endTime: s.dateTime("When the conference ended, when finished."),
    expireTime: s.dateTime("When Google deletes the conference record resource."),
  },
  { required: ["name"], additionalProperties: true },
);

const signedInUser = s.object("A participant signed in with a Google account.", {
  user: s.string("The Google user resource name."),
  displayName: s.string("The participant display name."),
});

const anonymousUser = s.object("A participant who joined without signing in.", {
  displayName: s.string("The name supplied when joining."),
});

const phoneUser = s.object("A participant who joined by phone.", {
  displayName: s.string("The partially redacted phone number shown by Google Meet."),
});

const participant = s.object(
  "A user who attended a Google Meet conference.",
  {
    name: s.nonEmptyString("The participant resource name."),
    earliestStartTime: s.dateTime("When the participant first joined."),
    latestEndTime: s.dateTime("When the participant most recently left."),
    signedinUser: signedInUser,
    anonymousUser,
    phoneUser,
  },
  { required: ["name"], additionalProperties: true },
);

const participantSession = s.object(
  "One join-to-leave session for a conference participant.",
  {
    name: s.nonEmptyString("The participant session resource name."),
    startTime: s.dateTime("When the participant session started."),
    endTime: s.dateTime("When the participant session ended."),
  },
  { required: ["name"], additionalProperties: true },
);

const driveDestination = s.object("The Google Drive destination of a recording.", {
  file: s.string("The Google Drive file ID of the MP4 recording."),
  exportUri: s.url("The browser URL for the recording."),
});

const docsDestination = s.object("The Google Docs destination of a generated artifact.", {
  document: s.string("The Google Docs document ID."),
  exportUri: s.url("The browser URL for the document."),
});

const artifactState = s.stringEnum("The current artifact generation state.", [
  "STATE_UNSPECIFIED",
  "STARTED",
  "ENDED",
  "FILE_GENERATED",
]);

const recording = s.object(
  "Metadata for a recording generated during a Google Meet conference.",
  {
    name: s.nonEmptyString("The recording resource name."),
    state: artifactState,
    startTime: s.dateTime("When recording started."),
    endTime: s.dateTime("When recording ended."),
    driveDestination,
  },
  { required: ["name"], additionalProperties: true },
);

const transcript = s.object(
  "Metadata for a transcript generated during a Google Meet conference.",
  {
    name: s.nonEmptyString("The transcript resource name."),
    state: artifactState,
    startTime: s.dateTime("When transcription started."),
    endTime: s.dateTime("When transcription ended."),
    docsDestination,
  },
  { required: ["name"], additionalProperties: true },
);

const transcriptEntry = s.object(
  "One speaker segment from a Google Meet transcript.",
  {
    name: s.nonEmptyString("The transcript entry resource name."),
    participant: s.string("The participant resource name for the speaker."),
    text: s.string("The transcribed speech."),
    languageCode: s.string("The BCP 47 language code of the speech."),
    startTime: s.dateTime("When the spoken segment started."),
    endTime: s.dateTime("When the spoken segment ended."),
  },
  { required: ["name"], additionalProperties: true },
);

const smartNote = s.object(
  "Metadata for smart notes generated during a Google Meet conference.",
  {
    name: s.nonEmptyString("The smart-note resource name."),
    state: artifactState,
    startTime: s.dateTime("When smart-note generation started."),
    endTime: s.dateTime("When smart-note generation ended."),
    docsDestination,
  },
  { required: ["name"], additionalProperties: true },
);

const pageToken = s.nonEmptyString("A pagination token returned by a previous list call.");
const nextPageToken = s.nullableString("A pagination token for the next page, or null when the page is final.");
const filter = s.nonEmptyString("A Google Meet API filter expression for this resource collection.");

const conferenceRecordNameInput = resourceNameInput(
  "The conference record resource name, such as conferenceRecords/{conference_record}.",
);
const participantNameInput = resourceNameInput(
  "The participant resource name, such as conferenceRecords/{conference_record}/participants/{participant}.",
);
const participantSessionNameInput = resourceNameInput(
  "The participant session resource name ending in participantSessions/{participant_session}.",
);
const recordingNameInput = resourceNameInput("The recording resource name ending in recordings/{recording}.");
const transcriptNameInput = resourceNameInput("The transcript resource name ending in transcripts/{transcript}.");
const transcriptEntryNameInput = resourceNameInput("The transcript entry resource name ending in entries/{entry}.");
const smartNoteNameInput = resourceNameInput("The smart-note resource name ending in smartNotes/{smart_note}.");

const actions: GoogleMeetActionSource[] = [
  action(
    "create_space",
    "Create a Google Meet space and return its join URL.",
    googleMeetCreateScopes,
    s.actionInput({ space: spaceWrite }),
    space,
  ),
  action(
    "get_space",
    "Retrieve a Google Meet space by resource name or meeting code.",
    googleMeetReadScopes,
    resourceNameInput("The space name, such as spaces/{space}, or a bare space ID or meeting code."),
    space,
  ),
  action(
    "update_space",
    "Update the configuration of a Google Meet space.",
    googleMeetSettingsScopes,
    s.actionInput(
      {
        name: s.nonEmptyString("The space resource name, in the form spaces/{space}."),
        space: spaceWrite,
        updateMask: s.nonEmptyString("A comma-separated Google field mask, such as config.accessType."),
      },
      ["name", "space"],
    ),
    space,
  ),
  action(
    "end_active_conference",
    "End the active conference currently running in a Google Meet space.",
    googleMeetCreateScopes,
    resourceNameInput(
      "The canonical space resource name, in the form spaces/{space}; bare IDs and meeting-code aliases are not accepted.",
    ),
    s.requiredObject("The result of ending the active conference.", {
      success: s.literal(true, { description: "Whether the request completed successfully." }),
    }),
  ),
  action(
    "list_conference_records",
    "List accessible Google Meet conference records with optional filtering and pagination.",
    googleMeetReadScopes,
    s.actionInput({
      filter,
      pageSize: s.integer("The maximum number of conference records to return.", { minimum: 1, maximum: 100 }),
      pageToken,
    }),
    listOutput("conferenceRecords", "Conference records in the requested page.", conferenceRecord),
  ),
  action(
    "get_conference_record",
    "Retrieve one Google Meet conference record.",
    googleMeetReadScopes,
    conferenceRecordNameInput,
    conferenceRecord,
  ),
  action(
    "list_participants",
    "List participants in a Google Meet conference record.",
    googleMeetReadScopes,
    filteredListInput("The parent conference record, such as conferenceRecords/{conference_record}.", 250),
    s.object(
      "A page of Google Meet participants.",
      {
        participants: s.array("Participants in the requested page.", participant),
        nextPageToken,
        totalSize: s.integer("The total participant count when requested through a field mask."),
      },
      { required: ["participants", "nextPageToken"] },
    ),
  ),
  action(
    "get_participant",
    "Retrieve one participant from a Google Meet conference record.",
    googleMeetReadScopes,
    participantNameInput,
    participant,
  ),
  action(
    "list_participant_sessions",
    "List join-to-leave sessions for a Google Meet participant.",
    googleMeetReadScopes,
    filteredListInput(
      "The parent participant, such as conferenceRecords/{conference_record}/participants/{participant}.",
      250,
    ),
    listOutput("participantSessions", "Participant sessions in the requested page.", participantSession),
  ),
  action(
    "get_participant_session",
    "Retrieve one Google Meet participant session.",
    googleMeetReadScopes,
    participantSessionNameInput,
    participantSession,
  ),
  action(
    "list_recordings",
    "List recordings generated for a Google Meet conference record.",
    googleMeetReadScopes,
    listInput("The parent conference record, such as conferenceRecords/{conference_record}.", 100),
    listOutput("recordings", "Recordings in the requested page.", recording),
  ),
  action("get_recording", "Retrieve one Google Meet recording.", googleMeetReadScopes, recordingNameInput, recording),
  action(
    "list_transcripts",
    "List transcripts generated for a Google Meet conference record.",
    googleMeetReadScopes,
    listInput("The parent conference record, such as conferenceRecords/{conference_record}.", 100),
    listOutput("transcripts", "Transcripts in the requested page.", transcript),
  ),
  action(
    "get_transcript",
    "Retrieve one Google Meet transcript.",
    googleMeetReadScopes,
    transcriptNameInput,
    transcript,
  ),
  action(
    "list_transcript_entries",
    "List speaker segments in a Google Meet transcript.",
    googleMeetReadScopes,
    listInput("The parent transcript, such as conferenceRecords/{conference_record}/transcripts/{transcript}.", 100),
    listOutput("transcriptEntries", "Transcript entries in the requested page.", transcriptEntry),
  ),
  action(
    "get_transcript_entry",
    "Retrieve one speaker segment from a Google Meet transcript.",
    googleMeetReadScopes,
    transcriptEntryNameInput,
    transcriptEntry,
  ),
  action(
    "list_smart_notes",
    "List smart notes generated for a Google Meet conference record.",
    googleMeetReadScopes,
    listInput("The parent conference record, such as conferenceRecords/{conference_record}.", 100),
    listOutput("smartNotes", "Smart notes in the requested page.", smartNote),
  ),
  action(
    "get_smart_note",
    "Retrieve one Google Meet smart-note artifact.",
    googleMeetReadScopes,
    smartNoteNameInput,
    smartNote,
  ),
];

export const googleMeetActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    providerPermissions: source.requiredScopes,
  }),
);

function action(
  name: string,
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogleMeetActionSource {
  return {
    name,
    description,
    requiredScopes,
    inputSchema,
    outputSchema,
  };
}

function resourceNameInput(description: string): JsonSchema {
  return s.actionInput({ name: s.nonEmptyString(description) }, ["name"]);
}

function listInput(parentDescription: string, maximumPageSize: number): JsonSchema {
  return s.actionInput(
    {
      parent: s.nonEmptyString(parentDescription),
      pageSize: s.integer("The maximum number of resources to return.", {
        minimum: 1,
        maximum: maximumPageSize,
      }),
      pageToken,
    },
    ["parent"],
  );
}

function filteredListInput(parentDescription: string, maximumPageSize: number): JsonSchema {
  return s.actionInput(
    {
      parent: s.nonEmptyString(parentDescription),
      filter,
      pageSize: s.integer("The maximum number of resources to return.", {
        minimum: 1,
        maximum: maximumPageSize,
      }),
      pageToken,
    },
    ["parent"],
  );
}

function listOutput(field: string, description: string, itemSchema: JsonSchema): JsonSchema {
  return s.requiredObject(`A paginated Google Meet ${field} response.`, {
    [field]: s.array(description, itemSchema),
    nextPageToken,
  });
}
