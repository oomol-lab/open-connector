import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "avoma" as const;

const pageSizeSchema = s.integer("Number of records returned per response.", {
  minimum: 1,
  maximum: 100,
});

const pageSchema = s.integer("Page number for paginated Avoma responses.", {
  minimum: 1,
});

const csvFilterSchema = (description: string) =>
  s.array(description, s.string("A single filter value.", { minLength: 1 }), {
    minItems: 1,
  });

const dateRangeFields = {
  fromDate: s.dateTime("Start date-time in UTC RFC3339 format."),
  toDate: s.dateTime("End date-time in UTC RFC3339 format."),
};

const crmFilterFields = {
  crmAccountIds: csvFilterSchema("CRM account external IDs to filter by."),
  crmOpportunityIds: csvFilterSchema("CRM opportunity external IDs to filter by."),
  crmContactIds: csvFilterSchema("CRM contact external IDs to filter by."),
  crmLeadIds: csvFilterSchema("CRM lead external IDs to filter by."),
};

const paginatedLooseOutputSchema = (description: string, itemField: string, itemDescription: string) =>
  s.object(description, {
    count: s.integer("Total number of records returned by Avoma.", { minimum: 0 }),
    next: s.nullable(s.string("URL to the next page if Avoma returned one.")),
    previous: s.nullable(s.string("URL to the previous page if Avoma returned one.")),
    [itemField]: s.array(itemDescription, s.looseObject("Raw Avoma object.")),
  });

const rawObjectOutputSchema = (description: string, field: string, fieldDescription: string) =>
  s.object(description, {
    [field]: s.looseObject(fieldDescription),
  });

const recordingOutputSchema = s.object("The Avoma recording lookup response.", {
  status: s.integer("HTTP status returned by Avoma for this recording lookup."),
  recording: s.looseObject("Raw Avoma recording response."),
});

export const avomaActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_meetings",
    description: "List Avoma meetings within a UTC date range, with optional attendee, CRM, and meeting filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Avoma meetings.",
      {
        ...dateRangeFields,
        page: pageSchema,
        pageSize: pageSizeSchema,
        recordingDurationGte: s.number(
          "Minimum recording duration in seconds. Meetings without recordings are excluded by Avoma when this filter is used.",
          { minimum: 0 },
        ),
        isCall: s.boolean("Whether to return only voice call meetings or only video meetings."),
        isInternal: s.boolean("Whether to return only internal meetings or only meetings with external attendees."),
        attendeeEmails: csvFilterSchema("Attendee email addresses to filter by."),
        ...crmFilterFields,
        includeCrmAssociations: s.boolean("Whether Avoma should include CRM associations."),
        order: s.stringEnum("Meeting ordering requested from Avoma.", ["start_at", "-start_at"]),
      },
      {
        optional: [
          "page",
          "pageSize",
          "recordingDurationGte",
          "isCall",
          "isInternal",
          "attendeeEmails",
          "crmAccountIds",
          "crmOpportunityIds",
          "crmContactIds",
          "crmLeadIds",
          "includeCrmAssociations",
          "order",
        ],
      },
    ),
    outputSchema: paginatedLooseOutputSchema(
      "Paginated Avoma meetings response.",
      "meetings",
      "Meeting objects returned by Avoma.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_meeting",
    description: "Get a single Avoma meeting by UUID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for reading an Avoma meeting.",
      {
        meetingUuid: s.uuid("Unique ID of the Avoma meeting."),
        includeCrmAssociations: s.boolean("Whether Avoma should include CRM associations."),
      },
      { optional: ["includeCrmAssociations"] },
    ),
    outputSchema: rawObjectOutputSchema("The Avoma meeting response.", "meeting", "Raw Avoma meeting object."),
  }),
  defineProviderAction(service, {
    name: "get_meeting_insights",
    description: "Get AI notes, keywords, speakers, and related insights for a completed Avoma meeting.",
    requiredScopes: [],
    inputSchema: s.object("Input for reading Avoma meeting insights.", {
      meetingUuid: s.uuid("Unique ID of the Avoma meeting."),
    }),
    outputSchema: rawObjectOutputSchema(
      "The Avoma meeting insights response.",
      "insights",
      "Raw Avoma meeting insights object.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_transcriptions",
    description:
      "List Avoma transcriptions for meetings within a UTC date range, with optional attendee and CRM filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Avoma transcriptions.",
      {
        ...dateRangeFields,
        page: pageSchema,
        pageSize: pageSizeSchema,
        attendeeEmails: csvFilterSchema("Attendee email addresses to filter by."),
        ...crmFilterFields,
      },
      {
        optional: [
          "page",
          "pageSize",
          "attendeeEmails",
          "crmAccountIds",
          "crmOpportunityIds",
          "crmContactIds",
          "crmLeadIds",
        ],
      },
    ),
    outputSchema: paginatedLooseOutputSchema(
      "Paginated Avoma transcriptions response.",
      "transcriptions",
      "Transcription objects returned by Avoma.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_transcription",
    description: "Get a single Avoma transcription by UUID.",
    requiredScopes: [],
    inputSchema: s.object("Input for reading an Avoma transcription.", {
      transcriptionUuid: s.uuid("Unique ID of the Avoma transcription."),
    }),
    outputSchema: rawObjectOutputSchema(
      "The Avoma transcription response.",
      "transcription",
      "Raw Avoma transcription object.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_recording_for_meeting",
    description: "Get Avoma recording download URLs for a meeting UUID when the recording is ready.",
    requiredScopes: [],
    inputSchema: s.object("Input for reading an Avoma recording by meeting UUID.", {
      meetingUuid: s.uuid("Unique ID of the Avoma meeting."),
    }),
    outputSchema: recordingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_recording",
    description: "Get Avoma recording download URLs by recording UUID when the recording is ready.",
    requiredScopes: [],
    inputSchema: s.object("Input for reading an Avoma recording by recording UUID.", {
      recordingUuid: s.uuid("Unique ID of the Avoma recording."),
    }),
    outputSchema: recordingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Avoma users visible to the API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required for listing Avoma users.", {}, { optional: [] }),
    outputSchema: s.object("The Avoma users response.", {
      users: s.array("User objects returned by Avoma.", s.looseObject("Raw Avoma user object.")),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a single Avoma user by UUID.",
    requiredScopes: [],
    inputSchema: s.object("Input for reading an Avoma user.", {
      userUuid: s.uuid("Unique ID of the Avoma user."),
    }),
    outputSchema: rawObjectOutputSchema("The Avoma user response.", "user", "Raw Avoma user object."),
  }),
];
