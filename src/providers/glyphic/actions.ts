import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "glyphic";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const objectIdString = (description: string) =>
  s.string({
    description,
    minLength: 24,
    maxLength: 24,
    pattern: "^[0-9a-f]{24}$",
  });
const directionSchema = s.stringEnum("The cursor pagination direction.", ["next", "prev"]);
const mediaTypeSchema = s.stringEnum("The Glyphic media type.", ["audio", "video"]);
const processStatusCodeSchema = s.nullable(
  s.stringEnum("The Glyphic call processing status code, or null when unavailable.", [
    "queued",
    "in_progress",
    "completed",
    "failed",
    "cancelled",
  ]),
);
const playbookTypeSchema = s.stringEnum("The Glyphic playbook type.", [
  "sales",
  "customer_success",
  "autogen_us",
  "autogen_emea",
  "autogen_apac",
]);

const rawObjectSchema = s.looseObject("The raw Glyphic response object.");
const paginationSchema = s.looseObject("Glyphic cursor pagination metadata.", {
  next_cursor: s.nullable(s.string("The cursor for the next page, or null when no next page is available.")),
  previous_cursor: s.nullable(
    s.string("The cursor for the previous page, or null when no previous page is available."),
  ),
});
const companySchema = s.looseObject("A company associated with a Glyphic call.", {
  name: s.nullable(s.string("The company name when Glyphic returns it.")),
  domain: s.string("The company domain."),
});
const participantSchema = s.looseObject("A participant associated with a Glyphic call.", {
  id: s.integer("The Glyphic participant identifier."),
  name: s.nullable(s.string("The participant name when Glyphic returns it.")),
  email: s.nullable(s.string("The participant email when Glyphic returns it.")),
});
const callTagSchema = s.looseObject("A Glyphic call tag.", {
  id: s.string("The Glyphic call tag identifier."),
  name: s.string("The Glyphic call tag name."),
  description: s.nullable(s.string("The Glyphic call tag description when available.")),
  group: s.nullable(s.string("The Glyphic call tag group when available.")),
});
const callStatusSchema = s.looseObject("A Glyphic call processing status.", {
  code: processStatusCodeSchema,
});
const callMediaSchema = s.looseObject("Glyphic media metadata for a call or snippet.", {
  media_type: s.nullable(mediaTypeSchema),
  media_url: s.nullable(s.string("The presigned media URL returned by Glyphic when available.")),
});
const transcriptTurnSchema = s.looseObject("A transcript turn returned by Glyphic.", {
  party_id: s.integer("The participant party identifier for the transcript turn."),
  turn_text: s.string("The transcript text for this turn."),
  timestamp: s.string("The timestamp for this transcript turn."),
});
const callInsightSchema = s.looseObject("An insight extracted from a Glyphic call.", {
  name: s.string("The insight name."),
  value: s.nullable(s.string("The insight value when available.")),
});
const callPreviewFields = {
  id: s.string("The Glyphic call identifier."),
  title: s.string("The call title."),
  companies: s.array("Companies associated with the call.", companySchema),
  participants: s.array("Participants associated with the call.", participantSchema),
  start_time: s.dateTime("The call start time."),
  duration: s.nullable(s.integer("The call duration in seconds when available.")),
  status: callStatusSchema,
  tags: s.array("Tags attached to the call.", callTagSchema),
};
const callPreviewSchema = s.looseObject("A Glyphic call preview.", callPreviewFields);
const callDetailSchema = s.looseObject("A Glyphic call detail.", {
  ...callPreviewFields,
  transcript_turns: s.nullable(s.array("Transcript turns returned for the call.", transcriptTurnSchema)),
  summary: s.nullable(s.string("The Glyphic call summary when available.")),
  media: s.nullable(callMediaSchema),
  url_link: s.nullable(s.string("The Glyphic call URL when available.")),
  insights: s.nullable(s.array("Insights extracted from the call.", callInsightSchema)),
  crm_deal_id: s.nullable(s.string("The related CRM deal identifier when available.")),
});
const callSnippetSchema = s.looseObject("A Glyphic call snippet.", {
  media: s.nullable(callMediaSchema),
  start_seconds: s.integer("The snippet start time in seconds."),
  end_seconds: s.integer("The snippet end time in seconds."),
  transcript_turns: s.array("Transcript turns in the snippet time range.", transcriptTurnSchema),
});
const playbookPreviewFields = {
  id: s.string("The Glyphic playbook identifier."),
  title: s.nullable(s.string("The playbook title when available.")),
  playbook_type: playbookTypeSchema,
  team_label: s.nullable(s.string("The team label associated with the playbook.")),
  updated_at: s.dateTime("The playbook update timestamp."),
};
const playbookPreviewSchema = s.looseObject("A Glyphic playbook preview.", playbookPreviewFields);
const playbookDetailSchema = s.looseObject("A Glyphic playbook detail.", {
  ...playbookPreviewFields,
  content: s.string("The playbook version content."),
  version_id: s.string("The Glyphic playbook version identifier."),
});
const playbookVersionSchema = s.looseObject("A Glyphic playbook version preview.", {
  id: s.string("The Glyphic playbook version identifier."),
  created_at: s.dateTime("The playbook version creation timestamp."),
});

const paginatedInputFields = {
  cursor: nonEmptyString("The cursor returned by a previous Glyphic list response."),
  limit: s.integer("The number of items to return per page.", { minimum: 1, maximum: 100 }),
  direction: directionSchema,
};
const paginatedOutputFields = {
  nextCursor: s.nullable(s.string("The cursor to pass on the next request, or null when no next page exists.")),
  previousCursor: s.nullable(
    s.string("The cursor to pass for the previous page, or null when no previous page exists."),
  ),
  pagination: paginationSchema,
};

export const glyphicActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_calls",
    description: "List public Glyphic calls with optional participant, time, title, tag, and cursor filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Glyphic calls.",
      {
        participantEmail: s.email("Filter calls by a participant email address."),
        startTimeFrom: s.dateTime("Only return calls starting at or after this UTC ISO 8601 time."),
        startTimeTo: s.dateTime("Only return calls starting at or before this UTC ISO 8601 time."),
        titleFilter: nonEmptyString("Query text used to filter calls by title."),
        tagIds: s.array(
          "Glyphic call tag identifiers to filter by.",
          objectIdString("A Glyphic call tag identifier."),
          {
            minItems: 1,
          },
        ),
        ...paginatedInputFields,
      },
      {
        optional: [
          "participantEmail",
          "startTimeFrom",
          "startTimeTo",
          "titleFilter",
          "tagIds",
          "cursor",
          "limit",
          "direction",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Glyphic calls.", {
      calls: s.array("The Glyphic calls returned by the API.", callPreviewSchema),
      ...paginatedOutputFields,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_call",
    description: "Retrieve one Glyphic call by ID, including transcript, summary, media, and insights.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Glyphic call.", {
      callId: objectIdString("The Glyphic call identifier."),
    }),
    outputSchema: s.object("The response returned when retrieving a Glyphic call.", {
      call: callDetailSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_call_media",
    description: "Retrieve presigned media URL metadata for a Glyphic call.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving Glyphic call media.", {
      callId: objectIdString("The Glyphic call identifier."),
    }),
    outputSchema: s.object("The response returned with Glyphic call media metadata.", {
      media: callMediaSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_call_snippets",
    description: "Retrieve snippets for a Glyphic call, including time ranges and transcript turns.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving Glyphic call snippets.", {
      callId: objectIdString("The Glyphic call identifier."),
    }),
    outputSchema: s.object("The response returned with Glyphic call snippets.", {
      snippets: s.array("The Glyphic snippets returned for the call.", callSnippetSchema),
      raw: s.array("The raw Glyphic snippet response array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_call_tags",
    description: "List all Glyphic call tags for the organization.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Glyphic call tags.", {}),
    outputSchema: s.object("The response returned when listing Glyphic call tags.", {
      tags: s.array("The Glyphic call tags returned by the API.", callTagSchema),
      raw: s.array("The raw Glyphic call tag response array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_playbooks",
    description: "List Glyphic playbooks with cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Glyphic playbooks.", paginatedInputFields, {
      optional: ["cursor", "limit", "direction"],
    }),
    outputSchema: s.object("The response returned when listing Glyphic playbooks.", {
      playbooks: s.array("The Glyphic playbooks returned by the API.", playbookPreviewSchema),
      ...paginatedOutputFields,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_playbook",
    description: "Retrieve a Glyphic playbook by ID, including the latest version content.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Glyphic playbook.", {
      playbookId: objectIdString("The Glyphic playbook identifier."),
    }),
    outputSchema: s.object("The response returned when retrieving a Glyphic playbook.", {
      playbook: playbookDetailSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_playbook_versions",
    description: "List versions for a Glyphic playbook.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Glyphic playbook versions.", {
      playbookId: objectIdString("The Glyphic playbook identifier."),
    }),
    outputSchema: s.object("The response returned when listing Glyphic playbook versions.", {
      versions: s.array("The Glyphic playbook versions returned by the API.", playbookVersionSchema),
      raw: s.array("The raw Glyphic playbook version response array.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_playbook_version",
    description: "Retrieve a specific Glyphic playbook version by playbook ID and version ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Glyphic playbook version.", {
      playbookId: objectIdString("The Glyphic playbook identifier."),
      versionId: objectIdString("The Glyphic playbook version identifier."),
    }),
    outputSchema: s.object("The response returned when retrieving a Glyphic playbook version.", {
      playbook: playbookDetailSchema,
      raw: rawObjectSchema,
    }),
  }),
];
