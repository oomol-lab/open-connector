import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "momentum_io";

const pageNumberSchema = s.integer("The page number to retrieve, using 1-based indexing.", {
  minimum: 1,
});
const pageSizeSchema = s.integer("The maximum number of records to return, from 1 to 50.", {
  minimum: 1,
  maximum: 50,
});
const timestampSchema = s.dateTime("An ISO 8601 date-time value.");
const salesforceIdSchema = s.string({
  minLength: 18,
  maxLength: 18,
  description: "An 18-character Salesforce record ID.",
});
const roleSchema = s.stringEnum("Momentum user role to filter by.", [
  "VIEWER",
  "EDITOR",
  "ORGANIZATION_ADMIN",
  "USER_ADMIN",
  "USER",
]);
const sourceTypeSchema = s.stringEnum("Momentum meeting source type to filter by.", [
  "AIRCALL",
  "CHORUS",
  "CLOUDTALK",
  "DIALPAD",
  "GONG",
  "MINDTICKLE",
  "MOMENTUM",
  "MS_TEAMS",
  "ORUM",
  "OUTREACH",
  "RINGCENTRAL",
  "SALESLOFT",
  "SALESLOFT_CI",
  "USER_PROVIDED",
  "VONAGE",
  "WEBEX",
  "WINGMAN",
  "WISER",
  "ZOOM",
  "ZOOM_PHONE",
]);

const userSchema = s.looseObject("A Momentum organization user.", {
  email: s.email("User email address."),
  name: s.string("User full name."),
  role: s.string("User role returned by Momentum."),
  type: s.string("Momentum user type."),
  slackUserId: s.nullable(s.string("Slack user ID, when connected.")),
  title: s.nullable(s.string("User job title from Slack, when available.")),
  salesforceDepartment: s.nullable(s.string("User department from Salesforce, when available.")),
  salesforceUserRole: s.nullable(s.string("User role from Salesforce, when available.")),
  licenseAdded: s.boolean("Whether the user has an active AI license."),
  licenseAssignedAt: s.nullable(s.dateTime("Timestamp when the license was assigned.")),
  salesforceAuthStatus: s.string("Salesforce authentication status."),
  gcalAuthStatus: s.string("Google Calendar authentication status."),
});

const attendeeSchema = s.looseObject("A Momentum meeting attendee.", {
  id: s.string("Attendee ID."),
  name: s.string("Attendee name."),
  email: s.email("Attendee email address."),
});

const meetingSchema = s.looseObject("A Momentum meeting.", {
  id: s.string("Meeting ID."),
  title: s.string("Meeting title."),
  startTime: s.dateTime("Meeting start time."),
  endTime: s.dateTime("Meeting end time."),
  host: s.nullable(
    s.looseObject("Meeting host.", {
      email: s.email("Host email address."),
      name: s.string("Host name."),
    }),
  ),
  attendees: s.array("Meeting attendees.", attendeeSchema),
  transcript: s.nullable(s.looseObject("Meeting transcript data.")),
  salesforceAccountId: s.nullable(s.string("Associated Salesforce account ID.")),
  salesforceLeadId: s.nullable(s.string("Associated Salesforce lead ID.")),
  salesforceOpportunityId: s.nullable(s.string("Associated Salesforce opportunity ID.")),
  downloadUrl: s.nullable(s.url("Temporary pre-signed meeting recording download URL.")),
  downloadUrlExpiresAt: s.nullable(s.dateTime("Expiration timestamp for the temporary download URL.")),
});

const signalSchema = s.looseObject("A Momentum signal prompt or definition.", {
  id: s.integer("Unique identifier for the signal."),
  signalName: s.string("Display name of the signal."),
  contextSource: s.string("Source context that triggers the signal."),
  enabled: s.boolean("Whether the signal is enabled."),
  createdAt: s.dateTime("Timestamp when the signal was created."),
});

const signalExecutionSchema = s.looseObject("A Momentum signal execution.", {
  signalId: s.integer("Identifier for the signal that was triggered."),
  signalName: s.string("Name of the signal that was triggered."),
  triggeredAt: s.dateTime("Timestamp when the signal was triggered."),
  sourceId: s.anyOf("Identifier for the source item that triggered the signal.", [
    s.integer("A numeric source item identifier."),
    s.string("A string source item identifier."),
  ]),
  sourceType: s.string("Type of source that triggered the signal."),
  sourceTitle: s.nullable(s.string("Title of the source item.")),
  prompt: s.nullable(s.string("Prompt text used for the signal.")),
  reason: s.nullable(s.string("AI-generated reason explaining why the signal was triggered.")),
  hostEmail: s.nullable(s.email("Email address of the meeting host.")),
  attendeeEmails: s.nullable(s.array("Meeting attendee email addresses.", s.email("Attendee email address."))),
  emailFrom: s.nullable(s.email("Sender email address for email-triggered signals.")),
  emailTo: s.nullable(
    s.array("Recipient email addresses for email-triggered signals.", s.email("Recipient email address.")),
  ),
  followUpPrompts: s.nullable(
    s.array("Follow-up prompt outputs returned by Momentum.", s.looseObject("A follow-up prompt output.")),
  ),
  customInstructions: s.nullable(
    s.array("Custom instruction outputs returned by Momentum.", s.looseObject("A custom instruction output.")),
  ),
  salesforceAccountId: s.nullable(s.string("Associated Salesforce account ID.")),
  salesforceOpportunityId: s.nullable(s.string("Associated Salesforce opportunity ID.")),
});

const listMeetingsInputSchema: JsonSchema = {
  ...s.object(
    "Input parameters for listing Momentum meetings.",
    {
      from: timestampSchema,
      to: timestampSchema,
      pageNumber: pageNumberSchema,
      pageSize: pageSizeSchema,
      salesforceAccountId: salesforceIdSchema,
      salesforceOpportunityId: salesforceIdSchema,
      attendeeEmailAddresses: s.array(
        "Email addresses that every returned meeting must include.",
        s.email("An attendee email address."),
        {
          minItems: 1,
        },
      ),
      sourceTypes: s.array("Meeting source types to include.", sourceTypeSchema, { minItems: 1 }),
      includeDownloadUrl: s.boolean("Whether to include temporary recording download URLs."),
    },
    {
      optional: [
        "from",
        "to",
        "pageNumber",
        "pageSize",
        "salesforceAccountId",
        "salesforceOpportunityId",
        "attendeeEmailAddresses",
        "sourceTypes",
        "includeDownloadUrl",
      ],
    },
  ),
  not: {
    required: ["salesforceAccountId", "salesforceOpportunityId"],
  },
};

export const momentumIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List Momentum organization users with optional pagination and filters.",
    inputSchema: s.object(
      "Input parameters for listing Momentum users.",
      {
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
        licenseAdded: s.boolean("Filter users by license status."),
        role: roleSchema,
      },
      { optional: ["pageNumber", "pageSize", "licenseAdded", "role"] },
    ),
    outputSchema: s.requiredObject("A paginated Momentum users response.", {
      users: s.array("Momentum users returned for the requested page.", userSchema),
      pageCount: s.integer("Total number of pages available for the query."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_meetings",
    description: "List Momentum meetings with optional date, attendee, Salesforce, and source filters.",
    inputSchema: listMeetingsInputSchema,
    outputSchema: s.object(
      "A paginated Momentum meetings response.",
      {
        meetings: s.array("Momentum meetings returned for the requested page.", meetingSchema),
        pageCount: s.integer("Total number of pages available for the query."),
      },
      { optional: ["pageCount"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_signal_prompts",
    description: "List Momentum AI signal prompts configured for the organization.",
    inputSchema: s.object("Input parameters for listing Momentum signal prompts.", {}),
    outputSchema: s.requiredObject("A Momentum signals response.", {
      signals: s.array("Momentum signals returned by the API.", signalSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_signal_executions",
    description: "List executions for a Momentum v1 signal prompt within a time range.",
    inputSchema: s.object(
      "Input parameters for listing Momentum signal executions.",
      {
        promptId: s.positiveInteger("The signal prompt ID to retrieve executions for."),
        executionFrom: timestampSchema,
        executionTo: timestampSchema,
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
        includeCustomInstructions: s.boolean("Whether to include custom instruction outputs in the response."),
      },
      { optional: ["executionTo", "pageNumber", "pageSize", "includeCustomInstructions"] },
    ),
    outputSchema: s.requiredObject("A paginated Momentum signal executions response.", {
      signals: s.array("Momentum signal executions returned for the requested page.", signalExecutionSchema),
      pageCount: s.integer("Total number of pages available for the query."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_signal_definitions",
    description: "List Momentum signal v2 definitions configured for the organization.",
    inputSchema: s.object("Input parameters for listing Momentum signal v2 definitions.", {}),
    outputSchema: s.requiredObject("A Momentum signals response.", {
      signals: s.array("Momentum signals returned by the API.", signalSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_signal_v2_executions",
    description: "List executions for a Momentum signal v2 definition within a time range.",
    inputSchema: s.object(
      "Input parameters for listing Momentum signal v2 executions.",
      {
        definitionId: s.positiveInteger("The signal definition ID to retrieve executions for."),
        executionFrom: timestampSchema,
        executionTo: timestampSchema,
        pageNumber: pageNumberSchema,
        pageSize: pageSizeSchema,
        includeFollowUpPrompts: s.boolean("Whether to include follow-up prompt outputs."),
      },
      { optional: ["executionTo", "pageNumber", "pageSize", "includeFollowUpPrompts"] },
    ),
    outputSchema: s.requiredObject("A paginated Momentum signal executions response.", {
      signals: s.array("Momentum signal executions returned for the requested page.", signalExecutionSchema),
      pageCount: s.integer("Total number of pages available for the query."),
    }),
  }),
];
