import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "callingly";

const trimmedString = (description: string, minLength = 1) =>
  s.string(description, {
    minLength,
  });

const idSchema = s.positiveInteger("Numeric identifier returned by Callingly.");
const accountIdSchema = s.positiveInteger("Agency account identifier used when acting on behalf of a client account.");
const teamIdSchema = s.positiveInteger("Callingly team identifier.");
const callIdSchema = s.positiveInteger("Callingly call identifier.");
const leadIdSchema = s.positiveInteger("Callingly lead identifier.");
const agentIdSchema = s.positiveInteger("Callingly agent identifier.");
const pageSchema = s.positiveInteger("One-based page number to retrieve.");
const limitSchema = s.integer("Maximum number of records to return.", {
  minimum: 1,
  maximum: 100,
});
const dateSchema = s.date("Calendar date in YYYY-MM-DD format.");
const nullableStringSchema = s.nullableString("Nullable text field returned by Callingly.");
const nullableIntegerSchema = s.nullableInteger("Nullable integer field returned by Callingly.");
const nullableBooleanSchema = s.nullableBoolean("Nullable boolean field returned by Callingly.");

const leadReferenceSchema = s.object("Lead summary returned in Callingly call payloads.", {
  id: idSchema,
  name: nullableStringSchema,
  label: nullableStringSchema,
  fname: nullableStringSchema,
  lname: nullableStringSchema,
  email: nullableStringSchema,
  phone_number: nullableStringSchema,
  phone_number_formatted: nullableStringSchema,
  source: nullableStringSchema,
  crm: nullableStringSchema,
  source_id: nullableStringSchema,
  deleted_at: nullableStringSchema,
});

const userReferenceSchema = s.object("Agent summary returned in Callingly call payloads.", {
  id: idSchema,
  name: nullableStringSchema,
  fname: nullableStringSchema,
  lname: nullableStringSchema,
  email: nullableStringSchema,
  phone_number: nullableStringSchema,
});

const teamReferenceSchema = s.object("Team summary returned by Callingly.", {
  id: idSchema,
  name: nullableStringSchema,
});

const callRecordSchema = s.object("Call record returned by Callingly.", {
  id: callIdSchema,
  started_at: nullableStringSchema,
  direction: nullableStringSchema,
  status: nullableStringSchema,
  status_formatted: nullableStringSchema,
  lead_status: nullableStringSchema,
  lead_status_formatted: nullableStringSchema,
  ring_status: nullableStringSchema,
  seconds: nullableIntegerSchema,
  duration: nullableStringSchema,
  retry: nullableIntegerSchema,
  lead_retry: nullableIntegerSchema,
  time_formatted: nullableStringSchema,
  from_formatted: nullableStringSchema,
  source: nullableStringSchema,
  recording_url: nullableStringSchema,
  waveform_url: nullableStringSchema,
  error_message: nullableStringSchema,
  phone_number_formatted: nullableStringSchema,
  human_result: nullableStringSchema,
  user: s.nullable(userReferenceSchema),
  lead: s.nullable(leadReferenceSchema),
  number: nullableStringSchema,
  tag: nullableStringSchema,
  notes: s.array("Notes returned with the call.", s.unknown("One note entry returned by Callingly.")),
  profile: s.nullable(teamReferenceSchema),
  is_voicemail: nullableIntegerSchema,
  is_queue: nullableIntegerSchema,
  is_team_offline: nullableIntegerSchema,
  scheduled_call_type: nullableStringSchema,
  old_lead_owner_id: nullableIntegerSchema,
  transcript: nullableStringSchema,
  sales_advice: nullableStringSchema,
  is_error: nullableIntegerSchema,
  error_code: nullableStringSchema,
});

const leadCallSummarySchema = s.object("Lead call summary returned by Callingly.", {
  id: idSchema,
  source: nullableStringSchema,
  seconds: nullableIntegerSchema,
  direction: nullableStringSchema,
  status: nullableStringSchema,
  result: nullableStringSchema,
  agent_retry: nullableIntegerSchema,
  lead_retry: nullableIntegerSchema,
  started_at: nullableStringSchema,
  recording_url: nullableStringSchema,
});

const leadOwnerSchema = s.object("Lead owner returned by Callingly.", {
  name: nullableStringSchema,
  phone_number: nullableStringSchema,
  custom_id: nullableStringSchema,
});

const leadRecordSchema = s.object("Lead record returned by Callingly.", {
  id: leadIdSchema,
  account_id: nullableIntegerSchema,
  lead_owner_id: nullableIntegerSchema,
  fname: nullableStringSchema,
  lname: nullableStringSchema,
  email: nullableStringSchema,
  phone_number: nullableStringSchema,
  source: nullableStringSchema,
  source_id: nullableStringSchema,
  created_at: nullableStringSchema,
  company: nullableStringSchema,
  category: nullableStringSchema,
  status: nullableStringSchema,
  result: nullableStringSchema,
  team: s.nullable(teamReferenceSchema),
  tags: s.array("Lead tags returned by Callingly.", s.unknown("One lead tag entry.")),
  stage: nullableStringSchema,
  calls: s.array("Call summaries attached to the lead.", leadCallSummarySchema),
  scheduled_call_at: nullableStringSchema,
  lead_owner: s.nullable(leadOwnerSchema),
  is_stopped: nullableIntegerSchema,
  is_blocked: nullableIntegerSchema,
});

const teamRecordSchema = s.object("Team record returned by Callingly.", {
  id: teamIdSchema,
  account_id: nullableIntegerSchema,
  name: nullableStringSchema,
  is_record: nullableIntegerSchema,
  call_mode: nullableStringSchema,
  whispertext: nullableStringSchema,
  post_whispertext: nullableStringSchema,
  language: nullableStringSchema,
  delay: nullableIntegerSchema,
  is_retry: nullableIntegerSchema,
  retries: nullableIntegerSchema,
  retry_schedule: s.array("Retry delays for the team in minutes.", s.integer("One retry delay in minutes.")),
  is_reschedule: nullableIntegerSchema,
  is_retry_lead: nullableIntegerSchema,
  lead_retries: nullableIntegerSchema,
  lead_retry_schedule: s.array(
    "Lead retry delays for the team in minutes.",
    s.integer("One lead retry delay in minutes."),
  ),
  is_sms: nullableIntegerSchema,
  sms_body: nullableStringSchema,
  whispertext_voice: nullableStringSchema,
  is_users_available_for_call: nullableBooleanSchema,
});

const teamAgentSchema = s.object("Agent assignment returned for a Callingly team.", {
  id: agentIdSchema,
  name: nullableStringSchema,
  priority: nullableIntegerSchema,
  cap: nullableIntegerSchema,
});

const agentRecordSchema = s.object("Agent record returned by Callingly.", {
  id: agentIdSchema,
  account_id: nullableIntegerSchema,
  fname: nullableStringSchema,
  lname: nullableStringSchema,
  phone_number: nullableStringSchema,
  ext: nullableStringSchema,
  donotdisturb: nullableIntegerSchema,
  priority: nullableIntegerSchema,
  timezone: nullableStringSchema,
  is_available: nullableBooleanSchema,
});

const agentScheduleTimeSchema = s.object("One schedule time range returned by Callingly.", {
  start: nullableStringSchema,
  end: nullableStringSchema,
});

const agentScheduleDaySchema = s.object("One schedule day returned by Callingly.", {
  label: nullableStringSchema,
  day: s.integer("Zero-based day index where Sunday is 0."),
  is_available: s.boolean("Whether the agent is available on this day."),
  times: s.array("Time ranges for the day.", agentScheduleTimeSchema),
});

const deleteSuccessOutputSchema = s.object("Deletion acknowledgement returned by Callingly.", {
  success: s.boolean("Whether the operation succeeded."),
});

const getCallInputSchema = s.object("Path parameters for retrieving one Callingly call.", {
  callId: callIdSchema,
});

const listCallsInputSchema = s.object(
  "Query parameters for listing Callingly calls.",
  {
    start: dateSchema,
    end: dateSchema,
    teamId: teamIdSchema,
    accountId: accountIdSchema,
    limit: limitSchema,
    page: pageSchema,
  },
  { optional: ["start", "end", "teamId", "accountId", "limit", "page"] },
);

const createCallInputSchema = s.object(
  "Body fields for creating a Callingly call.",
  {
    account_id: accountIdSchema,
    team_id: teamIdSchema,
    first_name: trimmedString("Lead first name to use for the call."),
    last_name: trimmedString("Lead last name to use for the call."),
    phone_number: trimmedString("Lead phone number for the call."),
    email: s.email("Lead email address for the call."),
    company: trimmedString("Lead company name."),
    category: trimmedString("Lead category name."),
    source: trimmedString("Lead source label."),
    crm_id: s.integer("CRM identifier passed through to Callingly."),
    scheduled_at: trimmedString("Optional scheduled timestamp for the call."),
  },
  {
    optional: ["account_id", "email", "company", "category", "source", "crm_id", "scheduled_at"],
  },
);

const listLeadsInputSchema = s.object(
  "Query parameters for listing Callingly leads.",
  {
    start: dateSchema,
    end: dateSchema,
    phone_number: trimmedString("Lead phone number to filter by."),
    accountId: accountIdSchema,
  },
  { optional: ["start", "end", "phone_number", "accountId"] },
);

const getLeadInputSchema = s.object("Path parameters for retrieving one Callingly lead.", {
  leadId: leadIdSchema,
});

const updateLeadInputSchema = s.object(
  "Body fields for updating a Callingly lead.",
  {
    leadId: leadIdSchema,
    id: leadIdSchema,
    fname: trimmedString("Lead first name."),
    lname: trimmedString("Lead last name."),
    email: s.email("Lead email address."),
    phone_number: trimmedString("Lead phone number."),
    source: trimmedString("Lead source label."),
    company: trimmedString("Lead company name."),
    status: trimmedString("Lead status value."),
    result: s.nullable(s.string("Lead result value.")),
    stage: s.nullable(s.string("Lead stage value.")),
    is_stopped: s.integer("Whether the lead is stopped: 1 for yes, 0 for no.", {
      minimum: 0,
      maximum: 1,
    }),
    is_blocked: s.integer("Whether the lead is blocked: 1 for yes, 0 for no.", {
      minimum: 0,
      maximum: 1,
    }),
  },
  {
    optional: [
      "id",
      "fname",
      "lname",
      "email",
      "phone_number",
      "source",
      "company",
      "status",
      "result",
      "stage",
      "is_stopped",
      "is_blocked",
    ],
  },
);

const deleteLeadInputSchema = s.object("Path parameters for deleting one Callingly lead.", {
  leadId: leadIdSchema,
});

const listTeamsInputSchema = s.object(
  "Optional agency-scoped input for listing Callingly teams.",
  {
    accountId: accountIdSchema,
  },
  { optional: ["accountId"] },
);

const getTeamInputSchema = s.object("Path parameters for retrieving one Callingly team.", {
  teamId: teamIdSchema,
});

const listTeamAgentsInputSchema = s.object("Path parameters for listing agents assigned to one Callingly team.", {
  teamId: teamIdSchema,
});

const listAgentsInputSchema = s.object(
  "Query parameters for listing Callingly agents.",
  {
    account_id: accountIdSchema,
  },
  { optional: ["account_id"] },
);

const getAgentScheduleInputSchema = s.object("Path parameters for retrieving one Callingly agent schedule.", {
  agentId: agentIdSchema,
});

export const callinglyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_call",
    description: "Retrieve one Callingly call by ID.",
    requiredScopes: [],
    inputSchema: getCallInputSchema,
    outputSchema: s.object("One Callingly call record.", {
      call: callRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_calls",
    description: "List Callingly calls with optional date, team, and pagination filters.",
    requiredScopes: [],
    inputSchema: listCallsInputSchema,
    outputSchema: s.object("Call list response returned by Callingly.", {
      data: s.array("Calls returned by Callingly.", callRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_call",
    description: "Create a Callingly call from lead details and routing information.",
    requiredScopes: [],
    inputSchema: createCallInputSchema,
    outputSchema: s.object("Created Callingly call response.", {
      call: callRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_leads",
    description: "List Callingly leads with optional date or phone number filters.",
    requiredScopes: [],
    inputSchema: listLeadsInputSchema,
    outputSchema: s.object("Lead list response returned by Callingly.", {
      data: s.array("Leads returned by Callingly.", leadRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_lead",
    description: "Retrieve one Callingly lead by ID.",
    requiredScopes: [],
    inputSchema: getLeadInputSchema,
    outputSchema: s.object("One Callingly lead record.", {
      lead: leadRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_lead",
    description: "Update a Callingly lead by ID.",
    requiredScopes: [],
    inputSchema: updateLeadInputSchema,
    outputSchema: s.object("Updated Callingly lead response.", {
      lead: leadRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_lead",
    description: "Delete a Callingly lead by ID.",
    requiredScopes: [],
    inputSchema: deleteLeadInputSchema,
    outputSchema: deleteSuccessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List Callingly teams for the current account or a specified client account.",
    requiredScopes: [],
    inputSchema: listTeamsInputSchema,
    outputSchema: s.object("Team list response returned by Callingly.", {
      data: s.array("Teams returned by Callingly.", teamRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_team",
    description: "Retrieve one Callingly team by ID.",
    requiredScopes: [],
    inputSchema: getTeamInputSchema,
    outputSchema: s.object("One Callingly team record.", {
      team: teamRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_team_agents",
    description: "List agents assigned to one Callingly team.",
    requiredScopes: [],
    inputSchema: listTeamAgentsInputSchema,
    outputSchema: s.object("Team agent list response returned by Callingly.", {
      agents: s.array("Agents assigned to the team.", teamAgentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_agents",
    description: "List Callingly agents for the current account or a specified client account.",
    requiredScopes: [],
    inputSchema: listAgentsInputSchema,
    outputSchema: s.object("Agent list response returned by Callingly.", {
      data: s.array("Agents returned by Callingly.", agentRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_agent_schedule",
    description: "Retrieve the weekly schedule for one Callingly agent.",
    requiredScopes: [],
    inputSchema: getAgentScheduleInputSchema,
    outputSchema: s.object("Agent schedule response returned by Callingly.", {
      schedule: s.array("Schedule day entries returned by Callingly.", agentScheduleDaySchema),
    }),
  }),
];
