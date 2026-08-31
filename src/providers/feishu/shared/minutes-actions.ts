import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const minuteToken = s.string("The Feishu Minutes token.", { minLength: 1 });
const meetingId = s.string("The Feishu video meeting ID.", { minLength: 1 });
const pageSize = s.positiveInteger("The maximum number of results on this page.", {
  maximum: 50,
});
const pageToken = s.string("The page token returned by the previous request.", { minLength: 1 });
const item = s.looseRequiredObject(
  "A Feishu Minutes or VC object.",
  {},
  {
    optional: [],
  },
);
const pageOutput = s.object(
  "A normalized result page.",
  {
    items: s.array("The objects returned on this page.", item),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
const minutesTodoMutation = s.object(
  "One Minutes todo mutation.",
  {
    operation: s.stringEnum("The todo mutation operation.", ["add", "update", "delete"]),
    content: s.string("The plain-text todo content.", { minLength: 1 }),
    isDone: s.boolean("Whether the todo is complete."),
    todoId: s.string("The existing todo ID.", { minLength: 1 }),
  },
  {
    optional: ["content", "isDone", "todoId"],
  },
);
export function createFeishuMinutesActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "search_minutes",
      description: "Search Feishu Minutes by text, owners, participants, and creation time.",
      requiredScopes: ["minutes:minutes.search:read"],
      providerPermissions: ["minutes:minutes.search:read"],
      inputSchema: minutesSearchInput(),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_minutes_detail",
      description: "Get the basic metadata of one Feishu Minutes record.",
      requiredScopes: ["minutes:minutes.basic:read"],
      providerPermissions: ["minutes:minutes.basic:read"],
      inputSchema: s.object(
        "Identify the Minutes record.",
        { minuteToken },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The requested Minutes record.",
        { minute: item },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_minutes_transcript",
      description: "Get the generated transcript text of a Feishu Minutes record.",
      requiredScopes: ["minutes:minutes.artifacts:read"],
      providerPermissions: ["minutes:minutes.artifacts:read"],
      inputSchema: s.object(
        "Identify the Minutes record.",
        { minuteToken },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The generated transcript.",
        {
          minuteToken,
          transcript: s.string("The transcript text."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_minutes_summary",
      description: "Get the generated summary of a Feishu Minutes record.",
      requiredScopes: ["minutes:minutes.artifacts:read"],
      providerPermissions: ["minutes:minutes.artifacts:read"],
      inputSchema: s.object(
        "Identify the Minutes record.",
        { minuteToken },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The generated summary.",
        {
          minuteToken,
          summary: s.string("The summary text or Markdown."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_minutes_todos",
      description: "List the generated todos of a Feishu Minutes record.",
      requiredScopes: ["minutes:minutes.artifacts:read"],
      providerPermissions: ["minutes:minutes.artifacts:read"],
      inputSchema: s.object(
        "Identify the Minutes record.",
        { minuteToken },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The generated todos.",
        {
          minuteToken,
          items: s.array("Generated todo items.", item),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_minutes_download_metadata",
      description: "Get the temporary media download URL for a Feishu Minutes record without downloading it.",
      requiredScopes: ["minutes:minutes.media:export"],
      providerPermissions: ["minutes:minutes.media:export"],
      inputSchema: s.object(
        "Identify the Minutes record.",
        { minuteToken },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "Minutes media download metadata.",
        {
          minuteToken,
          downloadUrl: s.url("The temporary Feishu media download URL."),
          raw: item,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "update_minutes_title",
      description: "Update the title of one Feishu Minutes record.",
      requiredScopes: ["minutes:minutes:update"],
      providerPermissions: ["minutes:minutes:update"],
      inputSchema: s.object(
        "Identify the Minutes record and provide its new title.",
        {
          minuteToken,
          topic: s.string("The new Minutes title.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The updated Minutes title.",
        {
          minuteToken,
          topic: s.string("The updated Minutes title."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "apply_minutes_permission",
      description: "Apply for view or edit permission on one Feishu Minutes record.",
      requiredScopes: ["minutes:permission:apply"],
      providerPermissions: ["minutes:permission:apply"],
      inputSchema: s.object(
        "Identify the Minutes record and permission level.",
        {
          minuteToken,
          permission: s.stringEnum("The requested permission level.", ["view", "edit"]),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The submitted Minutes permission request.",
        {
          minuteToken,
          permission: s.string("The requested permission level."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "replace_minutes_speaker",
      description: "Replace a transcript speaker with another Feishu user in one Minutes record.",
      requiredScopes: ["minutes:minutes:readonly", "minutes:minutes:update"],
      providerPermissions: ["minutes:minutes:readonly", "minutes:minutes:update"],
      inputSchema: s.object(
        "Identify the Minutes record, source speaker, and replacement user.",
        {
          minuteToken,
          fromSpeakerId: s.string("The opaque transcript speaker_id to replace.", {
            minLength: 1,
          }),
          fromUserId: s.string("The source speaker open_id when speaker_id is unavailable.", {
            minLength: 1,
          }),
          toUserId: s.string("The replacement user's open_id.", { minLength: 1 }),
        },
        {
          optional: ["fromSpeakerId", "fromUserId"],
        },
      ),
      outputSchema: s.object(
        "The replaced transcript speaker.",
        {
          minuteToken,
          fromSpeakerId: s.string("The replaced speaker_id."),
          fromUserId: s.string("The replaced source user open_id."),
          toUserId: s.string("The replacement user open_id."),
        },
        {
          optional: ["fromSpeakerId", "fromUserId"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "replace_minutes_words",
      description: "Batch-replace words in the transcript of one Feishu Minutes record.",
      requiredScopes: ["minutes:minutes:update"],
      providerPermissions: ["minutes:minutes:update"],
      inputSchema: s.object(
        "Identify the Minutes record and provide word replacements.",
        {
          minuteToken,
          replacements: s.array(
            "The transcript word replacements.",
            s.object(
              "One source-to-target word replacement.",
              {
                sourceWord: s.string("The source word to replace.", { minLength: 1 }),
                targetWord: s.string("The replacement word."),
              },
              {
                optional: [],
              },
            ),
            { minItems: 1 },
          ),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The applied transcript replacements.",
        {
          minuteToken,
          replacements: s.array(
            "The replacements accepted by Feishu.",
            s.object(
              "One source-to-target word replacement.",
              {
                sourceWord: s.string("The replaced source word."),
                targetWord: s.string("The replacement word."),
              },
              {
                optional: [],
              },
            ),
          ),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "replace_minutes_summary",
      description: "Replace the AI-generated summary of one Feishu Minutes record.",
      requiredScopes: ["minutes:minutes:update"],
      providerPermissions: ["minutes:minutes:update"],
      inputSchema: s.object(
        "Identify the Minutes record and provide the replacement summary.",
        {
          minuteToken,
          summary: s.string("The replacement summary. Plain text and a limited Markdown subset render best.", {
            minLength: 1,
          }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The summary replacement result.",
        {
          minuteToken,
          updated: s.boolean("Whether the summary was updated."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "manage_minutes_todos",
      description: "Add, update, or delete multiple todo items in one Feishu Minutes record.",
      requiredScopes: ["minutes:minutes:update"],
      providerPermissions: ["minutes:minutes:update"],
      inputSchema: s.object(
        "Identify the Minutes record and provide ordered todo mutations.",
        {
          minuteToken,
          todos: s.array("Todo mutations applied in order.", minutesTodoMutation, {
            minItems: 1,
          }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The todo mutation result.",
        {
          minuteToken,
          count: s.integer("The number of submitted todo mutations.", { minimum: 0 }),
          updated: s.boolean("Whether the todo mutations were submitted successfully."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "search_vc_meetings",
      description: "Search Feishu video meetings by text, people, rooms, and time range.",
      requiredScopes: ["vc:meeting.search:read"],
      providerPermissions: ["vc:meeting.search:read"],
      inputSchema: meetingSearchInput(),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_vc_meeting",
      description: "Get Feishu video meeting metadata and participant data.",
      requiredScopes: ["vc:meeting.meetingevent:read"],
      providerPermissions: ["vc:meeting.meetingevent:read"],
      inputSchema: s.object(
        "Identify the meeting.",
        {
          meetingId,
          includeParticipants: s.boolean("Whether to include participant data."),
        },
        {
          optional: ["includeParticipants"],
        },
      ),
      outputSchema: s.object(
        "The requested meeting.",
        { meeting: item },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_vc_recording_metadata",
      description: "Get recording URL and duration metadata for a Feishu video meeting.",
      requiredScopes: ["vc:record:readonly"],
      providerPermissions: ["vc:record:readonly"],
      inputSchema: s.object(
        "Identify the meeting.",
        { meetingId },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The meeting recording metadata.",
        {
          meetingId,
          recording: item,
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
function minutesSearchInput() {
  return s.object(
    "Describe the Minutes search.",
    {
      query: s.string("Full-text search terms for Minutes."),
      ownerIds: s.array("Owner open_ids to match.", s.string("An owner open_id.", { minLength: 1 })),
      participantIds: s.array("Participant open_ids to match.", s.string("A participant open_id.", { minLength: 1 })),
      startTime: s.dateTime("The earliest Minutes creation time."),
      endTime: s.dateTime("The latest Minutes creation time."),
      pageSize,
      pageToken,
    },
    {
      optional: ["query", "ownerIds", "participantIds", "startTime", "endTime", "pageSize", "pageToken"],
    },
  );
}
function meetingSearchInput() {
  return s.object(
    "Describe the video meeting search.",
    {
      query: s.string("Full-text search terms for video meetings."),
      participantIds: s.array("Participant user IDs to match.", s.string("A participant user ID.", { minLength: 1 })),
      organizerIds: s.array("Organizer user IDs to match.", s.string("An organizer user ID.", { minLength: 1 })),
      roomIds: s.array("Meeting room IDs to match.", s.string("A meeting room ID.", { minLength: 1 })),
      startTime: s.dateTime("The earliest creation or meeting start time."),
      endTime: s.dateTime("The latest creation or meeting end time."),
      pageSize,
      pageToken,
    },
    {
      optional: ["query", "participantIds", "organizerIds", "roomIds", "startTime", "endTime", "pageSize", "pageToken"],
    },
  );
}
