import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "browser_use";
const sessionIdSchema = s.uuid("The Browser Use session ID.");

const modelSchema = s.stringEnum("The Browser Use model to run the task with.", [
  "bu-mini",
  "bu-max",
  "bu-ultra",
  "gemini-3-flash",
  "claude-sonnet-4.6",
  "claude-opus-4.6",
  "claude-opus-4.7",
  "gpt-5.4-mini",
]);

const sessionStatusSchema = s.stringEnum("The Browser Use session lifecycle status.", [
  "created",
  "idle",
  "running",
  "stopped",
  "timed_out",
  "error",
]);

const sessionSchema = s.looseObject("A Browser Use Cloud session.", {
  id: sessionIdSchema,
  status: sessionStatusSchema,
  model: modelSchema,
  title: s.nullableString("The auto-generated session title."),
  output: s.unknown("The agent final output when the task is complete."),
  outputSchema: s.nullable(s.looseObject("The requested structured output JSON Schema.")),
  stepCount: s.integer("The number of agent steps executed so far."),
  lastStepSummary: s.nullableString("The latest human-readable agent step summary."),
  isTaskSuccessful: s.nullableBoolean("Whether the task completed successfully."),
  liveUrl: s.nullableString("The live browser preview URL."),
  recordingUrls: s.array("The recording URLs returned for the session.", s.string("A Browser Use recording URL.")),
  profileId: s.nullable(s.uuid("The browser profile ID attached to this session.")),
  workspaceId: s.nullable(s.uuid("The workspace ID attached to this session.")),
  proxyCountryCode: s.nullableString("The country code used for the Browser Use proxy."),
  maxCostUsd: s.nullableString("The maximum cost limit in USD for this session."),
  totalInputTokens: s.integer("Total LLM input tokens consumed by this session."),
  totalOutputTokens: s.integer("Total LLM output tokens consumed by this session."),
  proxyUsedMb: s.string({
    minLength: 1,
    pattern: "\\S",
    description: "Proxy bandwidth used in megabytes.",
  }),
  llmCostUsd: s.string({ minLength: 1, pattern: "\\S", description: "Cost of LLM usage in USD." }),
  proxyCostUsd: s.string({
    minLength: 1,
    pattern: "\\S",
    description: "Cost of proxy bandwidth in USD.",
  }),
  browserCostUsd: s.string({
    minLength: 1,
    pattern: "\\S",
    description: "Cost of browser compute time in USD.",
  }),
  totalCostUsd: s.string({ minLength: 1, pattern: "\\S", description: "Total session cost in USD." }),
  screenshotUrl: s.nullableString("The latest expiring browser screenshot URL."),
  agentmailEmail: s.nullableString("The temporary AgentMail email address for this session."),
  integrationsUsed: s.array(
    "The Browser Use integrations used by this session.",
    s.string("A Browser Use integration identifier."),
  ),
  createdAt: s.dateTime("When the session was created."),
  updatedAt: s.dateTime("When the session was last updated."),
});

const runTaskInputSchema = s.object(
  "Input parameters for creating or dispatching a Browser Use Cloud agent task.",
  {
    task: s.string({
      minLength: 1,
      pattern: "\\S",
      description: "The natural-language instruction for the Browser Use agent.",
    }),
    model: modelSchema,
    sessionId: sessionIdSchema,
    keepAlive: s.boolean("Whether to keep the session alive after the task completes."),
    maxCostUsd: s.number("Maximum total cost in USD allowed for this session.", { exclusiveMinimum: 0 }),
    profileId: s.uuid("The browser profile ID to load into the session."),
    workspaceId: s.uuid("The workspace ID to attach to the session."),
    proxyCountryCode: s.nullableString(
      "The proxy country code, such as us, de, or jp. Use null through the proxy API to disable it.",
    ),
    outputSchema: s.looseObject("JSON Schema that the agent final output must conform to."),
    enableScheduledTasks: s.boolean("Whether the agent can create scheduled tasks."),
    sensitiveData: s.record(
      "Sensitive values exposed to the agent through secure placeholders.",
      s.string("A sensitive value that Browser Use should keep hidden from the model."),
    ),
    enableRecording: s.boolean("Whether Browser Use should record the browser session."),
    skills: s.boolean("Whether built-in Browser Use agent skills are enabled."),
    agentmail: s.boolean("Whether Browser Use should provision a temporary email inbox."),
    codeMode: s.boolean("Whether the agent should return structured text and Python code."),
    cacheScript: s.boolean("Whether deterministic script caching should be forced on or off."),
    useOwnKey: s.boolean("Whether Browser Use should use the user's configured LLM API key."),
    autoHeal: s.boolean("Whether cached script runs should auto-heal on bad output."),
  },
  {
    optional: [
      "model",
      "sessionId",
      "keepAlive",
      "maxCostUsd",
      "profileId",
      "workspaceId",
      "proxyCountryCode",
      "outputSchema",
      "enableScheduledTasks",
      "sensitiveData",
      "enableRecording",
      "skills",
      "agentmail",
      "codeMode",
      "cacheScript",
      "useOwnKey",
      "autoHeal",
    ],
  },
);

const runTaskOutputSchema = s.requiredObject("The Browser Use session returned after dispatching a task.", {
  session: sessionSchema,
  sessionId: sessionIdSchema,
});

const getSessionInputSchema = s.requiredObject("Input parameters for retrieving a Browser Use session.", {
  sessionId: sessionIdSchema,
});

const getSessionOutputSchema = s.requiredObject("The Browser Use session response.", {
  session: sessionSchema,
});

const listSessionsInputSchema = s.object(
  "Input parameters for listing Browser Use sessions.",
  {
    page: s.integer("The one-based page number.", { minimum: 1 }),
    pageSize: s.integer("The number of sessions per page.", { minimum: 1, maximum: 100 }),
  },
  { optional: ["page", "pageSize"] },
);

const listSessionsOutputSchema = s.requiredObject("The Browser Use session list response.", {
  sessions: s.array("The Browser Use sessions on this page.", sessionSchema),
  total: s.integer("The total number of matching sessions."),
  page: s.integer("The current one-based page number."),
  pageSize: s.integer("The number of sessions per page."),
});

const messageSchema = s.looseObject("A Browser Use session message.", {
  id: s.uuid("The Browser Use message ID."),
  sessionId: sessionIdSchema,
  role: s.string({
    minLength: 1,
    pattern: "\\S",
    description: "The message role returned by Browser Use.",
  }),
  data: s.string("The raw message content."),
  type: s.string("The Browser Use message type."),
  summary: s.string("A short human-readable message summary."),
  screenshotUrl: s.nullableString("The screenshot URL captured for this message."),
  hidden: s.boolean("Whether Browser Use marks the message as hidden."),
  createdAt: s.dateTime("When the message was created."),
});

const listSessionMessagesInputSchema = s.object(
  "Input parameters for listing Browser Use session messages.",
  {
    sessionId: sessionIdSchema,
    after: s.uuid("Return messages after this message ID."),
    before: s.uuid("Return messages before this message ID."),
    limit: s.integer("The maximum number of messages to return.", { minimum: 1, maximum: 100 }),
  },
  { optional: ["after", "before", "limit"] },
);

const listSessionMessagesOutputSchema = s.requiredObject("The Browser Use session message list.", {
  messages: s.array("The Browser Use messages in chronological order.", messageSchema),
  hasMore: s.boolean("Whether more messages are available through cursor pagination."),
});

const stopSessionInputSchema = s.object(
  "Input parameters for stopping a Browser Use session.",
  {
    sessionId: sessionIdSchema,
    strategy: s.stringEnum("How Browser Use should stop the session.", ["task", "session"]),
  },
  { optional: ["strategy"] },
);

const stopSessionOutputSchema = s.requiredObject("The Browser Use session response after stopping.", {
  session: sessionSchema,
});

const planInfoSchema = s.requiredObject("Browser Use account plan information.", {
  planName: s.string("The Browser Use plan name."),
  subscriptionStatus: s.nullableString("The subscription status."),
  subscriptionId: s.nullableString("The subscription ID."),
  subscriptionCurrentPeriodEnd: s.nullableString("The end of the current subscription period."),
  subscriptionCanceledAt: s.nullableString("When the subscription was canceled."),
});

const billingAccountSchema = s.object(
  "The Browser Use account billing response.",
  {
    name: s.nullableString("The Browser Use account user name."),
    totalCreditsBalanceUsd: s.number("The total credits balance in USD."),
    monthlyCreditsBalanceUsd: s.number("The monthly subscription credits balance in USD."),
    additionalCreditsBalanceUsd: s.number("The additional top-up credits balance in USD."),
    rateLimit: s.integer("The account rate limit."),
    planInfo: planInfoSchema,
    isFreeTier: s.boolean("Whether the account is on the free tier."),
    projectId: s.uuid("The Browser Use project ID."),
  },
  { optional: ["name", "isFreeTier"] },
);

const getBillingAccountOutputSchema = s.requiredObject("The Browser Use account billing information.", {
  account: billingAccountSchema,
});

const sessionLifecycle = {
  startActionId: "browser_use.run_task",
  statusActionId: "browser_use.get_session",
};

export const browserUseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "run_task",
    operationType: "write",
    description: "Create or reuse a Browser Use Cloud session and dispatch an agent task.",
    asyncLifecycle: sessionLifecycle,
    inputSchema: runTaskInputSchema,
    outputSchema: runTaskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_session",
    operationType: "read",
    description: "Get a Browser Use Cloud session and poll for task completion.",
    asyncLifecycle: sessionLifecycle,
    inputSchema: getSessionInputSchema,
    outputSchema: getSessionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sessions",
    operationType: "read",
    description: "List Browser Use Cloud sessions for the authenticated project.",
    inputSchema: listSessionsInputSchema,
    outputSchema: listSessionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_session_messages",
    operationType: "read",
    description: "List Browser Use Cloud messages for one session.",
    inputSchema: listSessionMessagesInputSchema,
    outputSchema: listSessionMessagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "stop_session",
    operationType: "destructive",
    description: "Stop a Browser Use Cloud session or the current task in that session.",
    inputSchema: stopSessionInputSchema,
    outputSchema: stopSessionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_billing_account",
    operationType: "read",
    description: "Get Browser Use Cloud account billing and plan information.",
    inputSchema: s.object("Input parameters for retrieving Browser Use account billing information.", {}),
    outputSchema: getBillingAccountOutputSchema,
  }),
];
