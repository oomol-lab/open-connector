import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cursor";

const rawObjectSchema = s.looseObject("A JSON object returned by Cursor.");

const pageSchema = s.positiveInteger("The 1-indexed page number to request.");
const pageSizeSchema = s.positiveInteger("The number of records to return per page.", { maximum: 500 });

const teamMemberSchema = s.object(
  {
    id: s.integer("The unique Cursor team member ID."),
    email: s.email("The team member email address."),
    name: s.string("The team member display name."),
    role: s.string("The team role such as member or owner."),
    isRemoved: s.boolean("Whether this member has been removed from the team."),
  },
  { required: ["id", "email"], optional: ["name", "role", "isRemoved"], description: "A Cursor team member." },
);

const paginationSchema = s.looseObject("Cursor pagination metadata.", {
  page: s.integer("The current 1-indexed page number."),
  pageSize: s.integer("The number of records requested per page."),
  totalCount: s.integer("The total number of matching records."),
  totalUsers: s.integer("The total number of matching users."),
  totalPages: s.integer("The total number of result pages."),
  hasNextPage: s.boolean("Whether another result page is available."),
  hasPreviousPage: s.boolean("Whether a previous result page is available."),
});

const auditEventSchema = s.looseObject("A Cursor audit log event.", {
  event_id: s.string("The Cursor audit event ID."),
  timestamp: s.dateTime("The event timestamp."),
  ip_address: s.string("The IP address associated with the event."),
  user_email: s.email("The user email address associated with the event."),
  event_type: s.string("The Cursor audit event type."),
  event_data: rawObjectSchema,
});

const dailyUsageRowSchema = s.looseObject("A Cursor daily usage row.", {
  userId: s.integer("The Cursor user ID."),
  day: s.date("The day covered by this usage row."),
  date: s.integer("The day timestamp in epoch milliseconds."),
  email: s.email("The user email address."),
  isActive: s.boolean("Whether the user had activity on this day."),
  totalLinesAdded: s.integer("The total lines added."),
  totalLinesDeleted: s.integer("The total lines deleted."),
  acceptedLinesAdded: s.integer("The AI-suggested added lines that were accepted."),
  acceptedLinesDeleted: s.integer("The AI-suggested deleted lines that were accepted."),
  totalApplies: s.integer("The total AI code apply actions."),
  totalAccepts: s.integer("The total accepted AI suggestions."),
  totalRejects: s.integer("The total rejected AI suggestions."),
  totalTabsShown: s.integer("The total Tab completions shown."),
  totalTabsAccepted: s.integer("The total Tab completions accepted."),
  composerRequests: s.integer("The number of Composer requests."),
  chatRequests: s.integer("The number of chat requests."),
  agentRequests: s.integer("The number of Agent mode requests."),
  cmdkUsages: s.integer("The number of Cmd+K inline edit uses."),
  subscriptionIncludedReqs: s.integer("The subscription-included request count."),
  apiKeyReqs: s.integer("The API key request count."),
  usageBasedReqs: s.integer("The usage-based request count."),
  bugbotUsages: s.integer("The Bugbot usage count."),
  mostUsedModel: s.nullableString("The most frequently used model for the day."),
  applyMostUsedExtension: s.nullableString("The most common file extension for apply actions."),
  tabMostUsedExtension: s.nullableString("The most common file extension for Tab completions."),
  clientVersion: s.nullableString("The Cursor client version used."),
});

const spendRowSchema = s.looseObject("A Cursor team member spending row.", {
  userId: s.integer("The Cursor user ID."),
  name: s.string("The user display name."),
  email: s.email("The user email address."),
  role: s.string("The team role such as member or owner."),
  spendCents: s.number("The on-demand spend in cents for the current billing cycle."),
  overallSpendCents: s.number("The total spend in cents for the current billing cycle, including included usage."),
  fastPremiumRequests: s.integer("The number of usage-based premium requests."),
  hardLimitOverrideDollars: s.number("The custom hard spending limit override in dollars."),
  monthlyLimitDollars: s.nullableNumber("The monthly spending limit in dollars, or null when none is set."),
});

const agentId = s.nonEmptyString("Cloud agent ID returned by create_agent or list_agents (bc-...).");
const runId = s.nonEmptyString("Run ID returned by create_agent, create_run, or list_runs (run-...).");
const agentInput = s.requiredObject("Identify a cloud session.", { agentId });
const runInput = s.requiredObject("Identify a run within a cloud session.", { agentId, runId });
const limit = s.optional(s.positiveInteger("Page size; Cursor defaults to 20.", { maximum: 100 }));
const cursor = s.optional(s.nonEmptyString("Use nextCursor from the previous page; omit for the first page."));
const prompt = s.requiredObject("Instructions for one run.", {
  text: s.nonWhitespaceString("Task or follow-up instructions."),
});
const mode = s.optional(
  s.stringEnum("Choose plan to explore and propose changes, or agent to implement them.", ["agent", "plan"]),
);
const params = s.array(
  s.requiredObject("A model parameter supported by list_models.", {
    id: s.nonEmptyString("Parameter ID."),
    value: s.string("Parameter value."),
  }),
);
const model = s.requiredObject("Omit to use Cursor's configured model.", {
  id: s.nonEmptyString("Model ID from list_models."),
  params: s.optional(params),
});
const repo = s.requiredObject("Repository available to the Cursor GitHub App.", {
  url: s.url("GitHub repository URL, including https://."),
  startingRef: s.optional(s.nonEmptyString("Starting branch or commit; ignored when prUrl is supplied.")),
  prUrl: s.optional(s.url("Existing pull request to work on; url is still required.")),
});
const mcpServers = s.optional(
  s.array(
    s.oneOf([
      s.requiredObject("Remote MCP tools used by the cloud agent.", {
        name: s.nonEmptyString("Unique server name."),
        type: s.optional(s.stringEnum(["http", "sse"])),
        url: s.url("HTTP(S) MCP endpoint that Cursor can reach, without embedded credentials."),
        headers: s.optional(s.record(s.string(), { description: "Headers sent by Cursor to this MCP server." })),
      }),
      s.requiredObject("MCP server started inside the Cursor cloud VM.", {
        name: s.nonEmptyString("Unique server name."),
        type: s.optional(s.literal("stdio")),
        command: s.nonEmptyString("Command to run inside the cloud VM."),
        args: s.optional(s.array(s.string())),
        env: s.optional(s.record(s.string(), { description: "Environment variables for the MCP process." })),
      }),
    ]),
    {
      maxItems: 50,
      description:
        "Inline MCP servers. On a follow-up, replaces the current inline servers for that run; omit to retain them.",
    },
  ),
);
const git = s.looseObject("Current pushed branches across the agent, shared by all of its runs.", {
  branches: s.array(
    s.looseRequiredObject("A pushed branch.", {
      repoUrl: s.string("Repository host and path, without a URL scheme."),
      branch: s.optional(s.string("Pushed branch name.")),
      prUrl: s.optional(s.url("Pull request URL.")),
    }),
  ),
});
const agent = s.looseRequiredObject("Durable cloud session. Read latestRunId with get_run for execution progress.", {
  id: agentId,
  name: s.string("Agent name."),
  status: s.stringEnum(["ACTIVE", "IDLE", "ARCHIVED"]),
  createdAt: s.dateTime("Creation time."),
  updatedAt: s.dateTime("Last update time."),
  url: s.optional(s.url("Open this session in Cursor.")),
  latestRunId: s.optional(runId),
  env: s.optional(s.looseObject("Execution environment.", { type: s.string(), name: s.string() })),
  repos: s.optional(s.array(repo)),
  workOnCurrentBranch: s.optional(s.boolean("Whether commits are pushed to the starting branch.")),
  autoCreatePR: s.optional(s.boolean("Whether Cursor opens a pull request.")),
});
const run = s.looseRequiredObject("One prompt execution. Poll get_run until a terminal status to read result.", {
  id: runId,
  agentId,
  status: s.stringEnum(["CREATING", "RUNNING", "FINISHED", "ERROR", "CANCELLED", "EXPIRED"]),
  createdAt: s.dateTime("Creation time."),
  updatedAt: s.dateTime("Last update time."),
  durationMs: s.optional(s.nonNegativeInteger("Elapsed milliseconds for a terminal run.")),
  result: s.optional(s.string("Final assistant reply when available.")),
  git: s.optional(git),
});
const agentResult = s.requiredObject("Agent and initial run accepted by Cursor.", { agent, run });
const idResult = s.requiredObject("Identifier acknowledged by Cursor.", {
  id: s.nonEmptyString("Affected agent or run ID."),
});

export const cursorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_agent",
    description:
      "Create a durable Cursor cloud session and enqueue its first run. Returns immediately; poll get_run for the result. MCP servers can give the session access to external tools.",
    inputSchema: s.requiredObject("Start a cloud session.", {
      prompt,
      name: s.optional(s.nonEmptyString("Session name; generated from the prompt when omitted.", { maxLength: 100 })),
      repos: s.optional(
        s.array(repo, {
          maxItems: 20,
          description: "Repositories to clone. Omit for a no-repo VM, if enabled for your account.",
        }),
      ),
      model: s.optional(model),
      mode,
      mcpServers,
      autoCreatePR: s.optional(s.boolean("Open a pull request after the run finishes.")),
      workOnCurrentBranch: s.optional(
        s.boolean("Push to the starting branch or existing PR head; false creates a new branch."),
      ),
      skipReviewerRequest: s.optional(s.boolean("Skip requesting the user as reviewer when autoCreatePR is true.")),
    }),
    outputSchema: agentResult,
    followUpActions: ["cursor.get_run", "cursor.create_run"],
    asyncLifecycle: {
      startActionId: "cursor.create_agent",
      statusActionId: "cursor.get_run",
      cancelActionId: "cursor.cancel_run",
    },
  }),
  defineProviderAction(service, {
    name: "list_agents",
    description: "List cloud sessions, newest first. Use nextCursor to request another page.",
    inputSchema: s.requiredObject("Filter cloud sessions.", {
      limit,
      cursor,
      prUrl: s.optional(s.url("Filter by pull request URL.")),
      includeArchived: s.optional(s.boolean("Include archived sessions; Cursor defaults to true.")),
    }),
    outputSchema: s.requiredObject("One page of cloud sessions.", { items: s.array(agent), nextCursor: cursor }),
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Read a cloud session's configuration and latestRunId. Use get_run for execution status and results.",
    inputSchema: agentInput,
    outputSchema: agent,
  }),
  defineProviderAction(service, {
    name: "create_run",
    description:
      "Send a follow-up using the session's conversation and workspace. Wait for or cancel an active run before starting another. Unarchive archived sessions first.",
    inputSchema: s.requiredObject("Continue a cloud session.", { agentId, prompt, mode, mcpServers }),
    outputSchema: s.requiredObject("Accepted follow-up run.", { run }),
    followUpActions: ["cursor.get_run"],
    asyncLifecycle: {
      startActionId: "cursor.create_run",
      statusActionId: "cursor.get_run",
      cancelActionId: "cursor.cancel_run",
    },
  }),
  defineProviderAction(service, {
    name: "list_runs",
    description: "List a cloud session's runs, newest first, with cursor pagination.",
    inputSchema: s.requiredObject("List session runs.", { agentId, limit, cursor }),
    outputSchema: s.requiredObject("One page of runs.", { items: s.array(run), nextCursor: cursor }),
  }),
  defineProviderAction(service, {
    name: "get_run",
    description:
      "Read a run's progress, final assistant reply, and pushed branches. FINISHED, ERROR, CANCELLED, and EXPIRED are terminal statuses.",
    inputSchema: runInput,
    outputSchema: run,
  }),
  defineProviderAction(service, {
    name: "cancel_run",
    description: "Cancel an active run. To continue afterward, create a new run on the same session.",
    inputSchema: runInput,
    outputSchema: idResult,
  }),
  defineProviderAction(service, {
    name: "archive_agent",
    description:
      "Archive a session while retaining readable history. Call unarchive_agent before sending another prompt.",
    inputSchema: agentInput,
    outputSchema: idResult,
  }),
  defineProviderAction(service, {
    name: "unarchive_agent",
    description: "Restore an archived session so it can accept new runs.",
    inputSchema: agentInput,
    outputSchema: idResult,
  }),
  defineProviderAction(service, {
    name: "delete_agent",
    description: "Permanently delete a cloud session. This is irreversible; archive_agent provides reversible removal.",
    inputSchema: agentInput,
    outputSchema: idResult,
  }),
  defineProviderAction(service, {
    name: "list_models",
    description: "List available cloud agent models and their supported parameters and variants.",
    inputSchema: s.object({}),
    outputSchema: s.requiredObject("Available models.", {
      items: s.array(
        s.looseRequiredObject("A model available to this key.", {
          id: s.nonEmptyString("Model ID for create_agent."),
          displayName: s.string("Model name."),
          description: s.optional(s.string()),
          aliases: s.optional(s.stringArray("Alternative model IDs.")),
          parameters: s.optional(
            s.array(
              s.looseRequiredObject("Supported parameter values.", {
                id: s.string(),
                displayName: s.optional(s.string()),
                values: s.array(
                  s.looseRequiredObject("An allowed value.", {
                    value: s.string(),
                    displayName: s.optional(s.string()),
                  }),
                ),
              }),
            ),
          ),
          variants: s.optional(
            s.array(
              s.looseRequiredObject("A supported model configuration.", {
                params,
                displayName: s.string(),
                description: s.optional(s.string()),
                isDefault: s.optional(s.boolean()),
              }),
            ),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_team_members",
    requiredScopes: ["admin:*"],
    description: "List team members. Requires Enterprise Admin API access.",
    inputSchema: s.object({}, { description: "The input for listing Cursor team members." }),
    outputSchema: s.object(
      {
        teamMembers: s.array(teamMemberSchema, { description: "The Cursor team members." }),
        raw: rawObjectSchema,
      },
      { required: ["teamMembers", "raw"], description: "The Cursor team members response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_audit_logs",
    requiredScopes: ["admin:*"],
    description:
      "List team audit events with time, user, event type, and page filters. Requires Enterprise Admin API access.",
    inputSchema: s.object(
      {
        startTime: s.nonEmptyString(
          "The start time as a Cursor date shortcut, ISO timestamp, date, or Unix timestamp.",
        ),
        endTime: s.nonEmptyString("The end time as a Cursor date shortcut, ISO timestamp, date, or Unix timestamp."),
        eventTypes: s.stringArray("Cursor audit event types to include.", { minItems: 1 }),
        search: s.nonEmptyString("A search term used to filter audit events."),
        page: pageSchema,
        pageSize: pageSizeSchema,
        users: s.stringArray("User emails or encoded Cursor user IDs to filter by.", { minItems: 1 }),
      },
      {
        optional: ["startTime", "endTime", "eventTypes", "search", "page", "pageSize", "users"],
        description: "The input for listing Cursor audit logs.",
      },
    ),
    outputSchema: s.object(
      {
        events: s.array(auditEventSchema, { description: "The Cursor audit log events." }),
        pagination: paginationSchema,
        params: rawObjectSchema,
        raw: rawObjectSchema,
      },
      {
        required: ["events", "pagination", "raw"],
        optional: ["params"],
        description: "The Cursor audit logs response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_daily_usage_data",
    requiredScopes: ["admin:*"],
    description: "Retrieve up to 30 days of team usage metrics. Requires Enterprise Admin API access.",
    inputSchema: s.object(
      {
        startDate: s.integer("The inclusive start date in epoch milliseconds."),
        endDate: s.integer("The inclusive end date in epoch milliseconds."),
        page: pageSchema,
        pageSize: s.positiveInteger("The number of users to return per page.", { maximum: 1000 }),
      },
      {
        required: ["startDate", "endDate"],
        optional: ["page", "pageSize"],
        description: "The input for retrieving Cursor daily usage data.",
      },
    ),
    outputSchema: s.object(
      {
        data: s.array(dailyUsageRowSchema, { description: "The Cursor daily usage rows." }),
        period: rawObjectSchema,
        pagination: paginationSchema,
        raw: rawObjectSchema,
      },
      {
        required: ["data", "period", "raw"],
        optional: ["pagination"],
        description: "The Cursor daily usage data response.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_team_spend",
    requiredScopes: ["admin:*"],
    description:
      "Retrieve team spending for the current billing cycle with search, sorting, and pagination. Requires Enterprise Admin API access.",
    inputSchema: s.object(
      {
        searchTerm: s.nonEmptyString("Search text matched against user names and emails."),
        sortBy: s.stringEnum("The field used to sort spending rows.", ["amount", "date", "user"]),
        sortDirection: s.stringEnum("The sort direction for spending rows.", ["asc", "desc"]),
        page: pageSchema,
        pageSize: s.positiveInteger("The number of spending rows to return per page."),
      },
      {
        optional: ["searchTerm", "sortBy", "sortDirection", "page", "pageSize"],
        description: "The input for retrieving Cursor team spending.",
      },
    ),
    outputSchema: s.object(
      {
        teamMemberSpend: s.array(spendRowSchema, { description: "The Cursor team member spending rows." }),
        subscriptionCycleStart: s.integer("The current subscription cycle start timestamp in epoch milliseconds."),
        totalMembers: s.integer("The total number of matching team members."),
        totalPages: s.integer("The total number of spending pages."),
        raw: rawObjectSchema,
      },
      {
        required: ["teamMemberSpend", "subscriptionCycleStart", "totalMembers", "totalPages", "raw"],
        description: "The Cursor team spending response.",
      },
    ),
  }),
];
