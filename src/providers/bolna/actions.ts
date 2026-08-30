import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bolna";

const statusFilterValues = [
  "scheduled",
  "queued",
  "rescheduled",
  "ringing",
  "initiated",
  "in-progress",
  "call-disconnected",
  "completed",
  "balance-low",
  "busy",
  "no-answer",
  "canceled",
  "failed",
  "stopped",
  "error",
] satisfies string[];

const providerFilterValues = ["plivo", "twilio", "websocket", "web-call"] satisfies string[];
const callTypeValues = ["inbound", "outbound"] satisfies string[];

const concurrencySchema = s.object(
  "The concurrency summary returned by Bolna.",
  {
    max: s.integer("The maximum concurrency limit for the workspace."),
    current: s.integer("The current number of running calls in the workspace."),
  },
  { required: ["max", "current"] },
);

const userSchema = s.looseRequiredObject(
  "The authenticated Bolna user summary.",
  {
    id: s.uuid("The Bolna user identifier."),
    name: s.string("The display name of the Bolna user."),
    email: s.email("The email address of the Bolna user."),
    wallet: s.number("The current wallet balance returned by Bolna."),
    concurrency: concurrencySchema,
  },
  {
    optional: ["name", "email", "wallet", "concurrency"],
  },
);

const taskSchema = s.looseObject("One Bolna task definition returned by the agent.");
const agentPromptsSchema = s.looseObject("The Bolna agent prompts object keyed by task name, such as task_1.");
const ingestSourceConfigSchema = s.looseObject("The Bolna ingest source configuration returned for the agent.");

const agentSchema = s.looseRequiredObject(
  "One Bolna agent returned by the API.",
  {
    id: s.uuid("The Bolna agent identifier."),
    agent_name: s.string("The human-readable Bolna agent name."),
    agent_type: s.string("The Bolna agent type."),
    agent_status: s.string("The current Bolna agent status."),
    created_at: s.dateTime("The creation timestamp returned by Bolna."),
    updated_at: s.dateTime("The last update timestamp returned by Bolna."),
    tasks: s.array("The tasks configured on the Bolna agent.", taskSchema),
    ingest_source_config: s.nullable(ingestSourceConfigSchema),
    agent_prompts: agentPromptsSchema,
  },
  {
    optional: ["agent_type", "agent_status", "updated_at", "tasks", "ingest_source_config", "agent_prompts"],
  },
);

const executionSchema = s.looseRequiredObject(
  "One Bolna execution returned by the API.",
  {
    id: s.uuid("The Bolna execution identifier."),
    agent_id: s.uuid("The Bolna agent identifier attached to the execution."),
    batch_id: s.string("The Bolna batch identifier when the execution belongs to a batch."),
    conversation_duration: s.number("The execution conversation duration in seconds."),
    total_cost: s.number("The total execution cost in cents."),
    status: s.string("The current Bolna execution status."),
    error_message: s.string("The execution error message returned by Bolna."),
    answered_by_voice_mail: s.boolean("Whether the execution reached voicemail."),
    transcript: s.string("The execution transcript returned by Bolna."),
    created_at: s.dateTime("The execution creation timestamp."),
    updated_at: s.dateTime("The execution last update timestamp."),
    cost_breakdown: s.looseObject("The Bolna execution cost breakdown object."),
    telephony_data: s.looseObject("The telephony details returned by Bolna."),
    transfer_call_data: s.looseObject("The transfer call details returned by Bolna."),
    batch_run_details: s.looseObject("The batch metadata returned by Bolna."),
    extracted_data: s.nullable(s.looseObject("The extracted data object returned by Bolna.")),
    context_details: s.looseObject("The context variables returned by Bolna."),
  },
  {
    optional: [
      "batch_id",
      "conversation_duration",
      "total_cost",
      "error_message",
      "answered_by_voice_mail",
      "transcript",
      "updated_at",
      "cost_breakdown",
      "telephony_data",
      "transfer_call_data",
      "batch_run_details",
      "extracted_data",
      "context_details",
    ],
  },
);

const executionLogSchema = s.looseRequiredObject(
  "One Bolna execution log entry.",
  {
    created_at: s.dateTime("The log creation timestamp."),
    type: s.stringEnum("The direction of the log entry.", ["request", "response"]),
    component: s.string("The Bolna component that produced the log entry."),
    provider: s.string("The provider associated with the log entry."),
    data: s.string("The log payload or message returned by Bolna."),
    reasoning_content: s.string("The optional reasoning content returned by Bolna."),
  },
  {
    optional: ["provider", "reasoning_content"],
  },
);

const getUserInfoInputSchema = s.object("Input payload for reading Bolna user information.", {});

const getAgentInputSchema = s.object(
  "Input payload for retrieving one Bolna agent.",
  {
    agent_id: s.uuid("The Bolna agent identifier."),
  },
  { required: ["agent_id"] },
);

const listAgentExecutionsInputSchema = s.object(
  "Input payload for listing executions of one Bolna agent.",
  {
    agent_id: s.uuid("The Bolna agent identifier."),
    page_number: s.positiveInteger("The page number to request from Bolna.", { maximum: 9999 }),
    page_size: s.positiveInteger("The number of executions to request from Bolna.", {
      maximum: 50,
    }),
    status: s.stringEnum("The execution status filter accepted by Bolna.", statusFilterValues),
    call_type: s.stringEnum("The call type filter accepted by Bolna.", callTypeValues),
    provider: s.stringEnum("The provider filter accepted by Bolna.", providerFilterValues),
    answered_by_voice_mail: s.boolean("Whether to filter executions answered by voicemail."),
    batch_id: s.string("The Bolna batch identifier used to filter executions.", {
      minLength: 1,
    }),
    from: s.dateTime("The inclusive execution start timestamp filter in ISO 8601 format."),
    to: s.dateTime("The inclusive execution end timestamp filter in ISO 8601 format."),
  },
  {
    required: ["agent_id"],
  },
);

const getExecutionInputSchema = s.object(
  "Input payload for retrieving one Bolna execution.",
  {
    execution_id: s.uuid("The Bolna execution identifier."),
  },
  { required: ["execution_id"] },
);

const listAgentsOutputSchema = s.object(
  "The Bolna agent list wrapper.",
  {
    agents: s.array("The Bolna agents returned by the workspace.", agentSchema),
  },
  { required: ["agents"] },
);

const getUserInfoOutputSchema = s.object(
  "The Bolna user info wrapper.",
  {
    user: userSchema,
  },
  { required: ["user"] },
);

const getAgentOutputSchema = s.object(
  "The Bolna agent detail wrapper.",
  {
    agent: agentSchema,
  },
  { required: ["agent"] },
);

const listAgentExecutionsOutputSchema = s.object(
  "The Bolna execution list wrapper.",
  {
    page_number: s.integer("The current page number returned by Bolna."),
    page_size: s.integer("The current page size returned by Bolna."),
    total: s.integer("The total number of matching executions returned by Bolna."),
    has_more: s.boolean("Whether Bolna reports that more execution pages are available."),
    executions: s.array("The normalized Bolna executions for this page.", executionSchema),
  },
  { required: ["page_number", "page_size", "total", "has_more", "executions"] },
);

const getExecutionOutputSchema = s.object(
  "The Bolna execution detail wrapper.",
  {
    execution: executionSchema,
  },
  { required: ["execution"] },
);

const getExecutionRawLogsOutputSchema = s.object(
  "The Bolna execution raw log wrapper.",
  {
    status: s.string("The status string returned by Bolna for the raw log request."),
    logs: s.array("The normalized Bolna execution log entries.", executionLogSchema),
  },
  { required: ["status", "logs"] },
);

export const bolnaActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user_info",
    description: "Get the authenticated Bolna workspace user, wallet, and concurrency summary.",
    requiredScopes: [],
    inputSchema: getUserInfoInputSchema,
    outputSchema: getUserInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_agents",
    description: "List all Bolna voice agents in the authenticated workspace.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for listing Bolna agents.", {}),
    outputSchema: listAgentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Get one Bolna voice agent by agent_id.",
    requiredScopes: [],
    inputSchema: getAgentInputSchema,
    outputSchema: getAgentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_agent_executions",
    description: "List execution history for one Bolna voice agent.",
    requiredScopes: [],
    inputSchema: listAgentExecutionsInputSchema,
    outputSchema: listAgentExecutionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_execution",
    description: "Get one Bolna execution by execution_id.",
    requiredScopes: [],
    inputSchema: getExecutionInputSchema,
    outputSchema: getExecutionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_execution_raw_logs",
    description: "Get raw logs for one Bolna execution by execution_id.",
    requiredScopes: [],
    inputSchema: getExecutionInputSchema,
    outputSchema: getExecutionRawLogsOutputSchema,
  }),
];
