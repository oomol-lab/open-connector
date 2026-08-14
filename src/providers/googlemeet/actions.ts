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
  {
    name: "create_space",
    description: "Create a Google Meet space and return its join URL.",
    requiredScopes: googleMeetCreateScopes,
    inputSchema: s.actionInput({ space: spaceWrite }),
    outputSchema: space,
  },
  {
    name: "get_space",
    description: "Retrieve a Google Meet space by resource name or meeting code.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: resourceNameInput("The space name, such as spaces/{space}, or a bare space ID or meeting code."),
    outputSchema: space,
  },
  {
    name: "update_space",
    description: "Update the configuration of a Google Meet space.",
    requiredScopes: googleMeetSettingsScopes,
    inputSchema: s.actionInput(
      {
        name: s.nonEmptyString("The space resource name, in the form spaces/{space}."),
        space: spaceWrite,
        updateMask: s.nonEmptyString("A comma-separated Google field mask, such as config.accessType."),
      },
      ["name", "space"],
    ),
    outputSchema: space,
  },
  {
    name: "end_active_conference",
    description: "End the active conference currently running in a Google Meet space.",
    requiredScopes: googleMeetCreateScopes,
    inputSchema: resourceNameInput(
      "The canonical space resource name, in the form spaces/{space}; bare IDs and meeting-code aliases are not accepted.",
    ),
    outputSchema: s.requiredObject("The result of ending the active conference.", {
      success: s.literal(true, { description: "Whether the request completed successfully." }),
    }),
  },
  {
    name: "list_conference_records",
    description: "List accessible Google Meet conference records with optional filtering and pagination.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: s.actionInput({
      filter,
      pageSize: s.integer("The maximum number of conference records to return.", { minimum: 1, maximum: 100 }),
      pageToken,
    }),
    outputSchema: listOutput("conferenceRecords", "Conference records in the requested page.", conferenceRecord),
  },
  {
    name: "get_conference_record",
    description: "Retrieve one Google Meet conference record.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: conferenceRecordNameInput,
    outputSchema: conferenceRecord,
  },
  {
    name: "list_participants",
    description: "List participants in a Google Meet conference record.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: filteredListInput("The parent conference record, such as conferenceRecords/{conference_record}.", 250),
    outputSchema: s.object(
      "A page of Google Meet participants.",
      {
        participants: s.array("Participants in the requested page.", participant),
        nextPageToken,
        totalSize: s.integer("The total participant count when requested through a field mask."),
      },
      { required: ["participants", "nextPageToken"] },
    ),
  },
  {
    name: "get_participant",
    description: "Retrieve one participant from a Google Meet conference record.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: participantNameInput,
    outputSchema: participant,
  },
  {
    name: "list_participant_sessions",
    description: "List join-to-leave sessions for a Google Meet participant.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: filteredListInput(
      "The parent participant, such as conferenceRecords/{conference_record}/participants/{participant}.",
      250,
    ),
    outputSchema: listOutput("participantSessions", "Participant sessions in the requested page.", participantSession),
  },
  {
    name: "get_participant_session",
    description: "Retrieve one Google Meet participant session.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: participantSessionNameInput,
    outputSchema: participantSession,
  },
  {
    name: "list_recordings",
    description: "List recordings generated for a Google Meet conference record.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: listInput("The parent conference record, such as conferenceRecords/{conference_record}.", 100),
    outputSchema: listOutput("recordings", "Recordings in the requested page.", recording),
  },
  {
    name: "get_recording",
    description: "Retrieve one Google Meet recording.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: recordingNameInput,
    outputSchema: recording,
  },
  {
    name: "list_transcripts",
    description: "List transcripts generated for a Google Meet conference record.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: listInput("The parent conference record, such as conferenceRecords/{conference_record}.", 100),
    outputSchema: listOutput("transcripts", "Transcripts in the requested page.", transcript),
  },
  {
    name: "get_transcript",
    description: "Retrieve one Google Meet transcript.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: transcriptNameInput,
    outputSchema: transcript,
  },
  {
    name: "list_transcript_entries",
    description: "List speaker segments in a Google Meet transcript.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: listInput(
      "The parent transcript, such as conferenceRecords/{conference_record}/transcripts/{transcript}.",
      100,
    ),
    outputSchema: listOutput("transcriptEntries", "Transcript entries in the requested page.", transcriptEntry),
  },
  {
    name: "get_transcript_entry",
    description: "Retrieve one speaker segment from a Google Meet transcript.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: transcriptEntryNameInput,
    outputSchema: transcriptEntry,
  },
  {
    name: "list_smart_notes",
    description: "List smart notes generated for a Google Meet conference record.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: listInput("The parent conference record, such as conferenceRecords/{conference_record}.", 100),
    outputSchema: listOutput("smartNotes", "Smart notes in the requested page.", smartNote),
  },
  {
    name: "get_smart_note",
    description: "Retrieve one Google Meet smart-note artifact.",
    requiredScopes: googleMeetReadScopes,
    inputSchema: smartNoteNameInput,
    outputSchema: smartNote,
  },
];

export const googleMeetActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    providerPermissions: source.requiredScopes,
  }),
);

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
