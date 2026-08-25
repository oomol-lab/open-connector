import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sunsama_mcp";

/**
 * Named actions for every tool exposed by Sunsama's official remote MCP server, captured live
 * from a connected account on 2026-08-25. Each action wraps the same underlying MCP tool call
 * as `sunsama_mcp.call_tool`, with the tool's own JSON Schema promoted to a first-class
 * `inputSchema` so callers get real per-tool validation and docs instead of a generic envelope.
 */
export const sunsamaMcpOfficialActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_task",
    description:
      "Creates a single task with a title, optional notes (markdown), and estimated time. Scheduled to a day by default; pass `backlog` instead to stage it in the backlog. This is also the tool for a task that links to an item in another tool — pass `integrationUrl`, which works for a backlog task too.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama create_task MCP tool.",
      type: "object",
      properties: {
        title: {
          description:
            'A short title of the task, should not be more than a few words. Required unless you pass integrationUrl: with a link, omit this and Sunsama titles the task from the linked item itself — only pass a title alongside integrationUrl when the user dictated one, never a placeholder like "Todoist task".',
          type: "string",
        },
        notes: {
          description:
            "Specific task-related notes in Markdown (e.g. requirements, links, context). Do not include conversation history.",
          type: "string",
        },
        timeEstimate: {
          description: "The estimated time in whole minutes for the task",
          type: "integer",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
        },
        objectiveId: {
          description: "The _id of the weekly objective the task should be associated with, if any.",
          type: "string",
        },
        day: {
          description:
            "The day the task should be scheduled to in YYYY-MM-DD format. Required unless `backlog` is passed, which stages the task with no day at all — do not invent a day to go alongside `backlog`, it is ignored.",
          type: "string",
        },
        backlog: {
          description:
            "Pass this to put the task in the backlog — work the user intends to do eventually but has not committed to a day — instead of scheduling it. An empty object is enough; the two fields only refine where it lands.",
          type: "object",
          properties: {
            timeBucket: {
              description:
                'The time bucket captures a rough idea of when a task should be done and also how likely it is to actually get done. Options: "in the next two weeks", "in the next month", "in the next quarter", "in the next year", "someday", "never". ',
              type: "string",
              enum: [
                "in the next two weeks",
                "in the next month",
                "in the next quarter",
                "in the next year",
                "someday",
                "never",
              ],
            },
            folderId: {
              description: "The _id of the backlog folder the task should be added.",
              type: "string",
            },
          },
        },
        channel: {
          description:
            "The channel the task should be added to. This does not need to be perfect. The closest match will be used. If not provided a channel will be added automatically as long as the user did not disable the channel prediction feature.",
          type: "string",
        },
        position: {
          default: "bottom",
          description:
            "Where to place the task in the list. Defaults to bottom. If the user asks for another position you should re-order the task after creating it.",
          type: "string",
          enum: ["top", "bottom"],
        },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: {
                description: "The title of the subtask",
                type: "string",
              },
              integration: {
                description:
                  'When the subtask represents its own external item (e.g. a parent "Desktop bug triage" task with one subtask per GitHub issue), pass integration on the subtask itself so each subtask is individually linked to its source.',
                oneOf: [
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "github",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "GitHub item id (issue/PR/discussion node id).",
                            type: "string",
                          },
                          repositoryOwnerLogin: {
                            description: 'Owner login, e.g. "sunsama".',
                            type: "string",
                          },
                          repositoryName: {
                            description: 'Repo name, e.g. "sunsama".',
                            type: "string",
                          },
                          number: {
                            description: "Issue / PR / discussion number.",
                            type: "number",
                          },
                          type: {
                            type: "string",
                            enum: ["Issue", "PullRequest", "Discussion"],
                          },
                        },
                        required: ["id", "repositoryOwnerLogin", "repositoryName", "number", "type"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "jira",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Jira issue id or key.",
                            type: "string",
                          },
                          cloudId: {
                            description: "Atlassian cloudId of the Jira site the issue lives on.",
                            type: "string",
                          },
                          accountId: {
                            description: "Atlassian accountId of the connected Jira account the issue was read with.",
                            type: "string",
                          },
                        },
                        required: ["id", "cloudId", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "linear",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Linear issue id (UUID, the GraphQL `id` field).",
                            type: "string",
                          },
                          identifier: {
                            description: 'Linear human identifier like "SUN-1386" (the GraphQL `identifier` field).',
                            type: "string",
                          },
                          number: {
                            description: "Linear issue number (integer, the GraphQL `number` field).",
                            type: "integer",
                            minimum: -9007199254740991,
                            maximum: 9007199254740991,
                          },
                          url: {
                            description: "Linear issue URL (the GraphQL `url` field).",
                            type: "string",
                          },
                          linearUserId: {
                            description:
                              "Linear user id of the connected Linear account the issue was read with (the GraphQL `viewer.id`).",
                            type: "string",
                          },
                          linearOrganizationId: {
                            description: "Linear organization id the issue belongs to (the GraphQL `organization.id`).",
                            type: "string",
                          },
                        },
                        required: ["id", "identifier", "number", "url", "linearUserId", "linearOrganizationId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "googleTasks",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Google Tasks task id (the `id` field on a tasks#task resource).",
                            type: "string",
                          },
                          listId: {
                            description:
                              "Google Tasks task list id (the `id` of the tasks#taskList that contains this task).",
                            type: "string",
                          },
                          accountId: {
                            description:
                              "Email address of the connected Google Tasks account that owns the list this task lives in.",
                            type: "string",
                          },
                        },
                        required: ["id", "listId", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "gmail",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description:
                              'Gmail thread id (the "threadId" field on any message in the API response — NOT the message id). Sunsama links tasks to threads, not individual messages.',
                            type: "string",
                          },
                          messageId: {
                            description:
                              'Gmail message id of the specific message in that thread (the "id" field on the message). Required so the in-app preview can open to the right message.',
                            type: "string",
                          },
                          accountId: {
                            description:
                              "Email address of the connected Gmail account the thread belongs to, as listed by the sunsama://email/accounts resource.",
                            type: "string",
                          },
                        },
                        required: ["id", "messageId", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "slack",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          permalink: {
                            description:
                              'Slack permalink to the specific message/thread, e.g. "https://workspace.slack.com/archives/CHANNELID/p1778871920033179". Copy the message\'s "Permalink" value verbatim — a permalink you assembled by hand will not resolve.',
                            type: "string",
                          },
                          notesMarkdown: {
                            description:
                              "Optional markdown excerpt of the message body / thread excerpt — useful as a fallback when the user looks at the task without clicking through to Slack. Keep short (1-3 lines).",
                            type: "string",
                          },
                        },
                        required: ["permalink"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "outlook",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Outlook message id.",
                            type: "string",
                          },
                          conversationId: {
                            type: "string",
                          },
                          internetMessageId: {
                            type: "string",
                          },
                          accountId: {
                            description:
                              "The `accountId` of the connected Outlook account, as listed by the sunsama://email/accounts resource — unlike Gmail, an Outlook accountId is the Microsoft Graph object id, not the email address. If all you have is the mailbox address, pass the address instead and it will be resolved to the accountId; an address belonging to no connected mailbox is an error.",
                            type: "string",
                          },
                        },
                        required: ["id", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                ],
              },
            },
            required: ["title"],
          },
        },
        recurrenceRule: {
          description:
            "The recurrence rule for the task in RRULE format. If provided the task will be created as a recurring task. Only the following parameters are supported: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), BYDAY, BYMONTHDAY, BYSETPOS, INTERVAL. Unsupported parameters such as COUNT and UNTIL will be rejected — Sunsama recurring tasks do not have a fixed end date or occurrence count.",
          type: "string",
        },
        recurringTaskStartTime: {
          description:
            'The estimated (projected) start time for the recurring task in 12 hour "h:mm A" format. Only used when recurrenceRule is provided. This is a SOFT start time used to order the task and auto-schedule it each day — it does NOT timebox the recurring instances onto the calendar at a fixed time, and Sunsama cannot carry an exact calendar timebox across a recurring series. If the user wants every occurrence pinned to the same exact time on their calendar, tell them that isn\'t supported rather than implying this sets it.',
          type: "string",
        },
        isRecurringTaskStartTimeOnlyAnEstimate: {
          description:
            "Whether the recurring task start time is only an estimate and not a rigid start time. Only used when recurrenceRule and recurringTaskStartTime are provided.",
          type: "boolean",
        },
        backlogPriority: {
          description:
            'The backlog priority for the task. Only applies when adding to the backlog. Valid values: "urgent", "high", "medium", "low", "none".',
          type: "string",
          enum: ["urgent", "high", "medium", "low", "none"],
        },
        dailyPriority: {
          description:
            'The daily priority level for the task. Only applies when scheduling to a day (not backlog). The date is derived from the "day" parameter.',
          type: "string",
          enum: ["urgent", "important", "normal", "low"],
        },
        integration: {
          description:
            "When the task originates from an item in a connected integration (an email, GitHub issue/PR, Jira issue) whose identifier fields you have actually read, pass the integration metadata so the task is properly linked back to its source. Don't include URLs — they're derived from the identifier fields. If the task is a parent block that bundles multiple external items, leave this unset and put the integration link on each subtask instead. If all you have is a link to the item, use integrationUrl instead — never guess identifier fields. Passing both is fine when you have both; the link is what gets used.",
          oneOf: [
            {
              type: "object",
              properties: {
                service: {
                  type: "string",
                  const: "github",
                },
                identifier: {
                  type: "object",
                  properties: {
                    id: {
                      description: "GitHub item id (issue/PR/discussion node id).",
                      type: "string",
                    },
                    repositoryOwnerLogin: {
                      description: 'Owner login, e.g. "sunsama".',
                      type: "string",
                    },
                    repositoryName: {
                      description: 'Repo name, e.g. "sunsama".',
                      type: "string",
                    },
                    number: {
                      description: "Issue / PR / discussion number.",
                      type: "number",
                    },
                    type: {
                      type: "string",
                      enum: ["Issue", "PullRequest", "Discussion"],
                    },
                  },
                  required: ["id", "repositoryOwnerLogin", "repositoryName", "number", "type"],
                },
              },
              required: ["service", "identifier"],
            },
            {
              type: "object",
              properties: {
                service: {
                  type: "string",
                  const: "jira",
                },
                identifier: {
                  type: "object",
                  properties: {
                    id: {
                      description: "Jira issue id or key.",
                      type: "string",
                    },
                    cloudId: {
                      description: "Atlassian cloudId of the Jira site the issue lives on.",
                      type: "string",
                    },
                    accountId: {
                      description: "Atlassian accountId of the connected Jira account the issue was read with.",
                      type: "string",
                    },
                  },
                  required: ["id", "cloudId", "accountId"],
                },
              },
              required: ["service", "identifier"],
            },
            {
              type: "object",
              properties: {
                service: {
                  type: "string",
                  const: "linear",
                },
                identifier: {
                  type: "object",
                  properties: {
                    id: {
                      description: "Linear issue id (UUID, the GraphQL `id` field).",
                      type: "string",
                    },
                    identifier: {
                      description: 'Linear human identifier like "SUN-1386" (the GraphQL `identifier` field).',
                      type: "string",
                    },
                    number: {
                      description: "Linear issue number (integer, the GraphQL `number` field).",
                      type: "integer",
                      minimum: -9007199254740991,
                      maximum: 9007199254740991,
                    },
                    url: {
                      description: "Linear issue URL (the GraphQL `url` field).",
                      type: "string",
                    },
                    linearUserId: {
                      description:
                        "Linear user id of the connected Linear account the issue was read with (the GraphQL `viewer.id`).",
                      type: "string",
                    },
                    linearOrganizationId: {
                      description: "Linear organization id the issue belongs to (the GraphQL `organization.id`).",
                      type: "string",
                    },
                  },
                  required: ["id", "identifier", "number", "url", "linearUserId", "linearOrganizationId"],
                },
              },
              required: ["service", "identifier"],
            },
            {
              type: "object",
              properties: {
                service: {
                  type: "string",
                  const: "googleTasks",
                },
                identifier: {
                  type: "object",
                  properties: {
                    id: {
                      description: "Google Tasks task id (the `id` field on a tasks#task resource).",
                      type: "string",
                    },
                    listId: {
                      description:
                        "Google Tasks task list id (the `id` of the tasks#taskList that contains this task).",
                      type: "string",
                    },
                    accountId: {
                      description:
                        "Email address of the connected Google Tasks account that owns the list this task lives in.",
                      type: "string",
                    },
                  },
                  required: ["id", "listId", "accountId"],
                },
              },
              required: ["service", "identifier"],
            },
            {
              type: "object",
              properties: {
                service: {
                  type: "string",
                  const: "gmail",
                },
                identifier: {
                  type: "object",
                  properties: {
                    id: {
                      description:
                        'Gmail thread id (the "threadId" field on any message in the API response — NOT the message id). Sunsama links tasks to threads, not individual messages.',
                      type: "string",
                    },
                    messageId: {
                      description:
                        'Gmail message id of the specific message in that thread (the "id" field on the message). Required so the in-app preview can open to the right message.',
                      type: "string",
                    },
                    accountId: {
                      description:
                        "Email address of the connected Gmail account the thread belongs to, as listed by the sunsama://email/accounts resource.",
                      type: "string",
                    },
                  },
                  required: ["id", "messageId", "accountId"],
                },
              },
              required: ["service", "identifier"],
            },
            {
              type: "object",
              properties: {
                service: {
                  type: "string",
                  const: "slack",
                },
                identifier: {
                  type: "object",
                  properties: {
                    permalink: {
                      description:
                        'Slack permalink to the specific message/thread, e.g. "https://workspace.slack.com/archives/CHANNELID/p1778871920033179". Copy the message\'s "Permalink" value verbatim — a permalink you assembled by hand will not resolve.',
                      type: "string",
                    },
                    notesMarkdown: {
                      description:
                        "Optional markdown excerpt of the message body / thread excerpt — useful as a fallback when the user looks at the task without clicking through to Slack. Keep short (1-3 lines).",
                      type: "string",
                    },
                  },
                  required: ["permalink"],
                },
              },
              required: ["service", "identifier"],
            },
            {
              type: "object",
              properties: {
                service: {
                  type: "string",
                  const: "outlook",
                },
                identifier: {
                  type: "object",
                  properties: {
                    id: {
                      description: "Outlook message id.",
                      type: "string",
                    },
                    conversationId: {
                      type: "string",
                    },
                    internetMessageId: {
                      type: "string",
                    },
                    accountId: {
                      description:
                        "The `accountId` of the connected Outlook account, as listed by the sunsama://email/accounts resource — unlike Gmail, an Outlook accountId is the Microsoft Graph object id, not the email address. If all you have is the mailbox address, pass the address instead and it will be resolved to the accountId; an address belonging to no connected mailbox is an error.",
                      type: "string",
                    },
                  },
                  required: ["id", "accountId"],
                },
              },
              required: ["service", "identifier"],
            },
          ],
        },
        integrationUrl: {
          description:
            "A link the task should be attached to. For an item in a connected integration (Asana, ClickUp, GitHub, Gmail, Jira, Linear, Loom, Monday.com, Notion, Outlook, Todoist, Trello, Microsoft Teams, Slack, Google Tasks, Microsoft To Do, Microsoft Planner) — say a Todoist task URL the user pasted — Sunsama looks the item up and creates a natively linked task: the provider's icon, a click-through to the original, and the existing completion/date synchronization. Any other URL is attached as a web page instead, with its title and preview unfurled. Use this whenever the user gives you a link instead of putting the link in notes, and use it in preference to the integration parameter for any service you did not fetch the item from yourself. Pass the URL alone, not surrounding prose.",
          type: "string",
        },
      },
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama create_task MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "reposition_task_in_backlog",
    description:
      "Repositions a task within the backlog by moving it to a specific time bucket (horizon) and position (append/prepend).",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama reposition_task_in_backlog MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The unique identifier `_id` of the task to reposition.",
          type: "string",
        },
        timeBucket: {
          description:
            'The time bucket captures a rough idea of when a task should be done and also how likely it is to actually get done. Options: "in the next two weeks", "in the next month", "in the next quarter", "in the next year", "someday", "never".',
          type: "string",
          enum: [
            "in the next two weeks",
            "in the next month",
            "in the next quarter",
            "in the next year",
            "someday",
            "never",
          ],
        },
        position: {
          description:
            'Where to position the task in the bucket. "prepend" places it at the top, "append" places it at the bottom.',
          type: "string",
          enum: ["append", "prepend"],
        },
      },
      required: ["taskId", "timeBucket"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama reposition_task_in_backlog MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "change_backlog_folder",
    description:
      "Moves one or more tasks to a backlog folder. If folderId is null, removes tasks from their current folder.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama change_backlog_folder MCP tool.",
      type: "object",
      properties: {
        taskIds: {
          description:
            "The unique identifier(s) `_id` of the task(s) to move. Can be a single task ID or an array of task IDs.",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "array",
              items: {
                type: "string",
              },
            },
          ],
        },
        folderId: {
          description:
            "The _id of the backlog folder to move the tasks to. If null, removes tasks from their current folder.",
          anyOf: [
            {
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["taskIds"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama change_backlog_folder MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "align_task_with_objective",
    description: "Aligns a task with an objective.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama align_task_with_objective MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to align with the objective.",
          type: "string",
        },
        objectiveId: {
          description: "The _id of the objective to align the task with.",
          type: "string",
        },
      },
      required: ["taskId", "objectiveId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama align_task_with_objective MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "add_task_to_channel",
    description: "Adds a task to a channel.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama add_task_to_channel MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to add to the channel.",
          type: "string",
        },
        channel: {
          description:
            "The channel to add the task to. This does not need to be perfect. The closest match will be used.",
          type: "string",
        },
      },
      required: ["taskId", "channel"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama add_task_to_channel MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "move_task_to_day",
    description: "Moves or defers a task to a specific date.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama move_task_to_day MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The unique identifier `_id` of the task to move.",
          type: "string",
        },
        calendarDay: {
          description: "The new date to move the task to in YYYY-MM-DD format.",
          type: "string",
        },
        sortOrder: {
          description:
            "The new sort order of the task. This should be an integer that is half way between the sort order of the task before it and the sort order of the task after it. If placing at the end of the list, use the sort order of the last task + 2048. If left blank, the task will be placed at the top of the list.",
          type: "number",
        },
      },
      required: ["taskId", "calendarDay"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama move_task_to_day MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "move_task_from_backlog",
    description: "Moves a task out of the backlog and onto a specific date.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama move_task_from_backlog MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The unique identifier `_id` of the task to move.",
          type: "string",
        },
        calendarDay: {
          description: "The new date to move the task to in YYYY-MM-DD format.",
          type: "string",
        },
        sortOrder: {
          description:
            "The new sort order of the task. This should be an integer that is half way between the sort order of the task before it and the sort order of the task after it. If placing at the end of the list, use the sort order of the last task + 2048. If left blank, the task will be placed at the top of the list.",
          type: "number",
        },
      },
      required: ["taskId", "calendarDay"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama move_task_from_backlog MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "unarchive_task",
    description: "Unarchives a task and moves it to a specific date or the backlog if no date is provided.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama unarchive_task MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The unique identifier `_id` of the task to move.",
          type: "string",
        },
        calendarDay: {
          description: "The new date to move the task to in YYYY-MM-DD format.",
          type: "string",
        },
        sortOrder: {
          description:
            "The new sort order of the task. This should be an integer that is half way between the sort order of the task before it and the sort order of the task after it. If placing at the end of the list, use the sort order of the last task + 2048. If left blank, the task will be placed at the top of the list.",
          type: "number",
        },
      },
      required: ["taskId", "calendarDay"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama unarchive_task MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "move_task_to_backlog",
    description:
      "Moves a task to the backlog. IF THE USER ASKS YOU TO MOVE A TASK TO A SPECIFIC DAY THEN YOU SHOULD USE THE move_task_to_day TOOL NOT THIS ONE.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama move_task_to_backlog MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The unique identifier `_id` of the task to move.",
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama move_task_to_backlog MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_time_estimate",
    description: "Gets the time estimate for a task in minutes.",
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama get_task_time_estimate MCP tool.",
      type: "object",
      properties: {
        title: {
          description: "The title of the task. The estimate will be based on similar task names.",
          type: "string",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama get_task_time_estimate MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "edit_task_recurrence_rule",
    description:
      "Updates the recurrence rule of an existing task. This is the preferred tool for temporarily pausing or skipping a recurring task for a specific period (e.g. vacation, leave). By combining deleteOldInstancesAfter (to clear instances during the skip period) and firstOccurrenceOnOrAfter (to restart the series afterwards), you can maintain the recurrence while accommodating temporary breaks — unlike delete_all_incomplete_recurring_task_instances which permanently terminates the series. When firstOccurrenceOnOrAfter is provided, this forks the recurring series: a new series begins from that date and the old series ends the day before.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama edit_task_recurrence_rule MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description:
            "The _id of any task instance in the recurring series to update. Can be the master or any child instance.",
          type: "string",
        },
        recurrenceRule: {
          description:
            "The new recurrence rule for the task in RRULE format. Only the following parameters are supported: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), BYDAY, BYMONTHDAY, BYSETPOS, INTERVAL. Unsupported parameters such as COUNT and UNTIL will be rejected — Sunsama recurring tasks do not have a fixed end date or occurrence count. The recurrence rule must not have more than one occurrence of a task on any given day.",
          type: "string",
        },
        firstOccurrenceOnOrAfter: {
          description:
            "The date to start the new recurrence on or after, in YYYY-MM-DD format. When provided for an existing recurring task, this forks the series: a new series starts from this date and the old series ends the day before. Instances from the old series before this date are preserved unless deleteOldInstancesAfter is also set. When omitted, the recurrence is updated in place starting from the current task date.",
          type: "string",
        },
        deleteOldInstancesAfter: {
          description:
            'Only used with firstOccurrenceOnOrAfter. Date in YYYY-MM-DD format. Deletes old series instances after this date while the new series picks up from firstOccurrenceOnOrAfter. This creates a temporary gap — use it when the user wants to skip a period (e.g. "skip next week", "I\'m on vacation until June 2nd"). Set to the last date the user wants to keep from the old series. Example: to skip May 26–30, set deleteOldInstancesAfter to 2026-05-23 (Friday before) and firstOccurrenceOnOrAfter to 2026-06-02 (Monday after).',
          type: "string",
        },
        startTime: {
          description:
            'The estimated (projected) start time of the recurring task in 12 hour "h:mm A" format. If not provided the start time will be set according to the old recurrence rule or it will be omitted. This is a SOFT start time used to order the task and auto-schedule it each day — it does NOT timebox the recurring instances onto the calendar at a fixed time, and Sunsama cannot carry an exact calendar timebox across a recurring series. If the user wants every occurrence pinned to the same exact time on their calendar, tell them that isn\'t supported rather than implying this sets it.',
          type: "string",
        },
        isStartTimeOnlyAnEstimate: {
          description:
            "Whether the start time is only an estimate and not a rigid start time. If not provided the start time will be set according to the old recurrence rule or it will be set to a rigid start time.",
          type: "boolean",
        },
      },
      required: ["taskId", "recurrenceRule"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama edit_task_recurrence_rule MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "edit_task_title",
    description: "Updates the title of an existing task.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama edit_task_title MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to update.",
          type: "string",
        },
        title: {
          description: "The new title for the task.",
          type: "string",
        },
      },
      required: ["taskId", "title"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama edit_task_title MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "edit_task_due_date",
    description:
      "Sets or clears the due date of a task. This is the hard deadline, not the day the task is planned/scheduled for (use move_task_to_day for that).",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama edit_task_due_date MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to update.",
          type: "string",
        },
        dueDate: {
          anyOf: [
            {
              description:
                'The new due date in ISO 8601 format (e.g. "2025-03-20T00:00:00.000Z"). Set to null or omit to clear the due date.',
              type: "string",
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama edit_task_due_date MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "edit_task_time_estimate",
    description: "Updates the time estimate of an existing task.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama edit_task_time_estimate MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description:
            "The _id of the task to update. If multiple timeboxed events are present you must update the duration of the associated event instead.",
          type: "string",
        },
        subtaskId: {
          description:
            "The _id of the subtask to update. If not provided, the time estimate will be updated for the entire task. If the task has any subtasks with planned time, you must provide a subtaskId since the time estimate for the task will be calculated based on the subtasks.",
          type: "string",
        },
        timeEstimate: {
          description: "The new time estimate in whole minutes.",
          type: "integer",
          minimum: -9007199254740991,
          maximum: 9007199254740991,
        },
      },
      required: ["taskId", "timeEstimate"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama edit_task_time_estimate MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "edit_task_notes",
    description:
      "Replaces the notes body of an existing task with new Markdown content. The full notes field is overwritten — use append_task_notes to add to existing notes without replacing them.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama edit_task_notes MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to update.",
          type: "string",
        },
        notes: {
          description:
            "The new notes body in Markdown. Replaces the existing notes entirely. Pass an empty string to clear notes.",
          type: "string",
        },
      },
      required: ["taskId", "notes"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama edit_task_notes MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "append_task_notes",
    description:
      "Appends Markdown content to the end of an existing task's notes. Existing notes are preserved; the new content is added below them with a horizontal rule separator. Use edit_task_notes to replace the notes body entirely.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama append_task_notes MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to update.",
          type: "string",
        },
        notes: {
          description:
            "The Markdown content to append to the task's existing notes. A horizontal rule separator is inserted between the existing notes and the new content.",
          type: "string",
        },
      },
      required: ["taskId", "notes"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama append_task_notes MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Deletes an existing task.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama delete_task MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to delete.",
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama delete_task MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "add_subtasks_to_task",
    description: "Adds multiple subtasks to an existing task. Do not use for merging existing tasks in as subtasks.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama add_subtasks_to_task MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to add the subtask to.",
          type: "string",
        },
        subtasks: {
          description: "The subtasks to add to the task.",
          type: "array",
          items: {
            type: "object",
            properties: {
              title: {
                description: "The title of the subtask.",
                type: "string",
              },
              timeEstimate: {
                description: "The estimated time in whole minutes for the subtask.",
                type: "integer",
                minimum: -9007199254740991,
                maximum: 9007199254740991,
              },
              integration: {
                description:
                  "When the subtask represents its own external item (e.g. one GitHub issue inside a parent triage task), pass integration on the subtask so it links to its source. Use the same shape as create_task's integration field.",
                oneOf: [
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "github",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "GitHub item id (issue/PR/discussion node id).",
                            type: "string",
                          },
                          repositoryOwnerLogin: {
                            description: 'Owner login, e.g. "sunsama".',
                            type: "string",
                          },
                          repositoryName: {
                            description: 'Repo name, e.g. "sunsama".',
                            type: "string",
                          },
                          number: {
                            description: "Issue / PR / discussion number.",
                            type: "number",
                          },
                          type: {
                            type: "string",
                            enum: ["Issue", "PullRequest", "Discussion"],
                          },
                        },
                        required: ["id", "repositoryOwnerLogin", "repositoryName", "number", "type"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "jira",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Jira issue id or key.",
                            type: "string",
                          },
                          cloudId: {
                            description: "Atlassian cloudId of the Jira site the issue lives on.",
                            type: "string",
                          },
                          accountId: {
                            description: "Atlassian accountId of the connected Jira account the issue was read with.",
                            type: "string",
                          },
                        },
                        required: ["id", "cloudId", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "linear",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Linear issue id (UUID, the GraphQL `id` field).",
                            type: "string",
                          },
                          identifier: {
                            description: 'Linear human identifier like "SUN-1386" (the GraphQL `identifier` field).',
                            type: "string",
                          },
                          number: {
                            description: "Linear issue number (integer, the GraphQL `number` field).",
                            type: "integer",
                            minimum: -9007199254740991,
                            maximum: 9007199254740991,
                          },
                          url: {
                            description: "Linear issue URL (the GraphQL `url` field).",
                            type: "string",
                          },
                          linearUserId: {
                            description:
                              "Linear user id of the connected Linear account the issue was read with (the GraphQL `viewer.id`).",
                            type: "string",
                          },
                          linearOrganizationId: {
                            description: "Linear organization id the issue belongs to (the GraphQL `organization.id`).",
                            type: "string",
                          },
                        },
                        required: ["id", "identifier", "number", "url", "linearUserId", "linearOrganizationId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "googleTasks",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Google Tasks task id (the `id` field on a tasks#task resource).",
                            type: "string",
                          },
                          listId: {
                            description:
                              "Google Tasks task list id (the `id` of the tasks#taskList that contains this task).",
                            type: "string",
                          },
                          accountId: {
                            description:
                              "Email address of the connected Google Tasks account that owns the list this task lives in.",
                            type: "string",
                          },
                        },
                        required: ["id", "listId", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "gmail",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description:
                              'Gmail thread id (the "threadId" field on any message in the API response — NOT the message id). Sunsama links tasks to threads, not individual messages.',
                            type: "string",
                          },
                          messageId: {
                            description:
                              'Gmail message id of the specific message in that thread (the "id" field on the message). Required so the in-app preview can open to the right message.',
                            type: "string",
                          },
                          accountId: {
                            description:
                              "Email address of the connected Gmail account the thread belongs to, as listed by the sunsama://email/accounts resource.",
                            type: "string",
                          },
                        },
                        required: ["id", "messageId", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "slack",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          permalink: {
                            description:
                              'Slack permalink to the specific message/thread, e.g. "https://workspace.slack.com/archives/CHANNELID/p1778871920033179". Copy the message\'s "Permalink" value verbatim — a permalink you assembled by hand will not resolve.',
                            type: "string",
                          },
                          notesMarkdown: {
                            description:
                              "Optional markdown excerpt of the message body / thread excerpt — useful as a fallback when the user looks at the task without clicking through to Slack. Keep short (1-3 lines).",
                            type: "string",
                          },
                        },
                        required: ["permalink"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                  {
                    type: "object",
                    properties: {
                      service: {
                        type: "string",
                        const: "outlook",
                      },
                      identifier: {
                        type: "object",
                        properties: {
                          id: {
                            description: "Outlook message id.",
                            type: "string",
                          },
                          conversationId: {
                            type: "string",
                          },
                          internetMessageId: {
                            type: "string",
                          },
                          accountId: {
                            description:
                              "The `accountId` of the connected Outlook account, as listed by the sunsama://email/accounts resource — unlike Gmail, an Outlook accountId is the Microsoft Graph object id, not the email address. If all you have is the mailbox address, pass the address instead and it will be resolved to the accountId; an address belonging to no connected mailbox is an error.",
                            type: "string",
                          },
                        },
                        required: ["id", "accountId"],
                      },
                    },
                    required: ["service", "identifier"],
                  },
                ],
              },
            },
            required: ["title"],
          },
        },
      },
      required: ["taskId", "subtasks"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama add_subtasks_to_task MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "restore_task",
    description: "Changes a task from deleted to not deleted.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama restore_task MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to mark as not deleted.",
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama restore_task MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "mark_task_as_completed",
    description:
      "Marks a task as completed. Can also be used to move a task to a previous day which auto-completes the task.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama mark_task_as_completed MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to mark as completed.",
          type: "string",
        },
        finishedDay: {
          description: "A date in YYYY-MM-DD the task was completed.",
          type: "string",
        },
      },
      required: ["taskId", "finishedDay"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama mark_task_as_completed MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "mark_task_as_incomplete",
    description: "Marks a task as incomplete.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama mark_task_as_incomplete MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: 'The _id of a completed task we want to mark as incomplete or "to do" again.',
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama mark_task_as_incomplete MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "edit_subtask_title",
    description: "Updates the title of an existing subtask.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama edit_subtask_title MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the parent task.",
          type: "string",
        },
        subtaskId: {
          description: "The _id of the subtask to update.",
          type: "string",
        },
        newTitle: {
          description: "The new title for the subtask.",
          type: "string",
        },
      },
      required: ["taskId", "subtaskId", "newTitle"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama edit_subtask_title MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "mark_subtask_as_completed",
    description: "Marks a subtask of an existing task as completed.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama mark_subtask_as_completed MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the parent task.",
          type: "string",
        },
        subtaskId: {
          description: "The _id of the subtask to mark as completed.",
          type: "string",
        },
      },
      required: ["taskId", "subtaskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama mark_subtask_as_completed MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "mark_subtask_as_incomplete",
    description: "Marks a subtask of an existing task as incomplete.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama mark_subtask_as_incomplete MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the parent task.",
          type: "string",
        },
        subtaskId: {
          description: "The _id of the subtask to mark as incomplete.",
          type: "string",
        },
      },
      required: ["taskId", "subtaskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama mark_subtask_as_incomplete MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "reorder_tasks",
    description: "Reorders tasks for the calendar day according to the provided order of taskIds.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama reorder_tasks MCP tool.",
      type: "object",
      properties: {
        taskIds: {
          description: "The _id(s) of the task(s) in the order they should appear.",
          type: "array",
          items: {
            type: "string",
          },
        },
        calendarDay: {
          description: "The date to reorder tasks for in YYYY-MM-DD format.",
          type: "string",
        },
      },
      required: ["taskIds", "calendarDay"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama reorder_tasks MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_backlog_tasks",
    description: "Fetches the users backlog tasks",
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama get_backlog_tasks MCP tool.",
      type: "object",
      properties: {
        page: {
          default: 0,
          description: "The page number to fetch (0-based)",
          type: "number",
        },
        queryId: {
          description: "All pages > 0 must pass in the queryId from the first page.",
          type: "string",
        },
        folderIds: {
          description:
            "Optional folder filter for page 0. Omit to fetch all backlog tasks. Include a folder _id to scope to that folder (multiple ids are unioned). Include `null` to include tasks that are not in any folder. Use `get_backlog_folders` to list available folder ids.",
          type: "array",
          items: {
            anyOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
        },
      },
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama get_backlog_tasks MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_archived_tasks",
    description: "Fetches the users archived tasks",
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama get_archived_tasks MCP tool.",
      type: "object",
      properties: {
        offset: {
          default: 0,
          description: "The offset to fetch from",
          type: "number",
        },
      },
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama get_archived_tasks MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "search_tasks",
    description: "Searches for tasks. Returns tasks that match the search term or are similar to the search term.",
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama search_tasks MCP tool.",
      type: "object",
      properties: {
        searchTerm: {
          description: "The search term to look for in task titles, notes, and comments",
          type: "string",
        },
      },
      required: ["searchTerm"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama search_tasks MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "update_all_incomplete_recurring_task_instances",
    description:
      "Updates all incomplete instances of a recurring task to match the current task. This is useful when you want to apply changes made to one instance of a recurring task to all future incomplete instances.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama update_all_incomplete_recurring_task_instances MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the recurring task to update all incomplete instances for.",
          type: "string",
        },
        updateType: {
          default: "allIncomplete",
          description:
            'The type of update to perform. "allIncomplete" updates all incomplete instances starting from today, "allAfterThisTask" updates all incomplete instances starting after the date of the task given by taskId.',
          type: "string",
          enum: ["allIncomplete", "allAfterThisTask"],
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object(
      "The normalized result returned by the Sunsama update_all_incomplete_recurring_task_instances MCP tool.",
      {
        result: s.unknown(
          "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
        ),
      },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_all_incomplete_recurring_task_instances",
    description:
      "PERMANENTLY deletes incomplete instances of a recurring task and TERMINATES the series, preventing any future instances from ever being created. This is irreversible. When afterDate is provided, only instances after that date are deleted and the series is terminated at that date. When omitted, all incomplete instances are deleted. WARNING: If the user wants to temporarily skip a period (e.g. vacation) and resume the series afterwards, do NOT use this tool — use edit_task_recurrence_rule with deleteOldInstancesAfter and firstOccurrenceOnOrAfter instead.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama delete_all_incomplete_recurring_task_instances MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the recurring task to delete all incomplete instances for.",
          type: "string",
        },
        afterDate: {
          description:
            "When provided (YYYY-MM-DD), all incomplete instances after this date are permanently deleted and the entire recurring series is terminated at this date — no future instances will ever be created. Instances on or before this date are preserved. This is NOT a temporary pause; the series ends permanently.",
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object(
      "The normalized result returned by the Sunsama delete_all_incomplete_recurring_task_instances MCP tool.",
      {
        result: s.unknown(
          "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
        ),
      },
    ),
  }),
  defineProviderAction(service, {
    name: "start_task_timer",
    description:
      "Starts the timer for a task or subtask. If a subtaskId is provided, starts the timer for that specific subtask.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama start_task_timer MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to start the timer for.",
          type: "string",
        },
        subtaskId: {
          description:
            "The _id of the subtask to start the timer for. If not provided, starts the timer for the entire task.",
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama start_task_timer MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "stop_task_timer",
    description:
      "Stops the timer for a task or subtask. If a subtaskId is provided, stops the timer for that specific subtask.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama stop_task_timer MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to stop the timer for.",
          type: "string",
        },
        subtaskId: {
          description:
            "The _id of the subtask to stop the timer for. If not provided, stops the timer for the entire task.",
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama stop_task_timer MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "set_backlog_priority",
    description:
      'Sets the backlog priority of a task. Backlog priority persists and is used for tasks in the backlog. Valid values: "urgent", "high", "medium", "low", "none". Set to null to clear.',
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama set_backlog_priority MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task.",
          type: "string",
        },
        backlogPriority: {
          description: "The backlog priority value, or null to clear.",
          anyOf: [
            {
              type: "string",
              enum: ["urgent", "high", "medium", "low", "none"],
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["taskId", "backlogPriority"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama set_backlog_priority MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "set_daily_priority",
    description:
      'Sets the daily priority of a task. Daily priority is tied to a specific day and decays after that day. Valid values: "urgent", "important", "normal", "low". Set to null to clear. The date is automatically determined from the task.',
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama set_daily_priority MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task.",
          type: "string",
        },
        dailyPriority: {
          description: "The daily priority level, or null to clear.",
          anyOf: [
            {
              type: "string",
              enum: ["urgent", "important", "normal", "low"],
            },
            {
              type: "null",
            },
          ],
        },
      },
      required: ["taskId", "dailyPriority"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama set_daily_priority MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task_by_id",
    description:
      "Fetches a single task by its Sunsama task ID. Returns full task details including integration information.",
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama get_task_by_id MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The Sunsama task ID (_id field) of the task to fetch",
          type: "string",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama get_task_by_id MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "move_calendar_event",
    description: "Updates a calendar event's date, time, and/or duration.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama move_calendar_event MCP tool.",
      type: "object",
      properties: {
        eventId: {
          description:
            "The unique ID of the calendar event to move. IMPORTANT: user must have owner or writer access to the event.",
          type: "string",
        },
        startDate: {
          description: "The target start date to move the event to, in YYYY-MM-DD format.",
          type: "string",
        },
        startTime: {
          description:
            'The target start time to move the event to, in 12 hour "h:mm A" format. Required if the event is not all day.',
          type: "string",
        },
        duration: {
          description: "The duration of the event in minutes. Required if the event is not all day",
          type: "number",
        },
        isAllDay: {
          description: "Whether the event is all day.",
          type: "boolean",
        },
      },
      required: ["eventId", "startDate", "isAllDay"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama move_calendar_event MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "create_calendar_event",
    description: "Creates a new calendar event.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama create_calendar_event MCP tool.",
      type: "object",
      properties: {
        title: {
          description: "The title of the calendar event.",
          type: "string",
        },
        startDate: {
          description:
            "The start date of the event in YYYY-MM-DD format. If this is in the past you must confirm with the user that you are creating a past event.",
          type: "string",
        },
        startTime: {
          description:
            'The start time of the event in 12 hour "h:mm A" format. Required if the event is not all day. If this is in the past you must confirm with the user that you are creating a past event.',
          type: "string",
        },
        duration: {
          default: 60,
          description: "The duration of the event in minutes. Required if the event is not all day",
          type: "number",
        },
        isAllDay: {
          default: false,
          description: "Whether the event is all day.",
          type: "boolean",
        },
        description: {
          description: "A brief description of the calendar event purpose or agenda.",
          type: "string",
        },
        calendarId: {
          description:
            "The ID of the calendar to create the event in. If not provided, the default calendar will be used. IMPORTANT: user must have owner or writer access to the calendar.",
          type: "string",
        },
      },
      required: ["title", "startDate"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama create_calendar_event MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "timebox_a_task_to_calendar",
    description:
      'Timeboxes a task to the calendar. This will create a timebox event for the task. This may also be referred to as "scheduling" a task or "adding a task to the calendar".',
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama timebox_a_task_to_calendar MCP tool.",
      type: "object",
      properties: {
        taskId: {
          description: "The _id of the task to timebox.",
          type: "string",
        },
        startDate: {
          description:
            "The start date of the event in YYYY-MM-DD format. If this is in the past you must confirm with the user that you are timeboxing a past task.",
          type: "string",
        },
        startTime: {
          description:
            'The start time of the event in 12 hour "h:mm A" format. If this is in the past you must confirm with the user that you are timeboxing a past task.',
          type: "string",
        },
        duration: {
          description:
            "The duration of the event in minutes. If not provided the timeEstimate of the task will be used or 30 minutes if the task has no time estimate.",
          type: "number",
        },
      },
      required: ["taskId", "startDate", "startTime"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama timebox_a_task_to_calendar MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_calendar_event",
    description:
      "Removes a calendar event and deletes all associated tasks. If the event is a meeting then any access role can remove the event. Otherwise only owners or writers can remove the event. Note: If the event is a meeting and the user is an owner or write this will remove the event for ALL attendees.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama delete_calendar_event MCP tool.",
      type: "object",
      properties: {
        eventId: {
          description: "The unique ID of the calendar event to remove.",
          type: "string",
        },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama delete_calendar_event MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "import_task_from_calendar_event",
    description: "Imports a calendar event as a task.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama import_task_from_calendar_event MCP tool.",
      type: "object",
      properties: {
        eventId: {
          description: "The unique ID of the calendar event to import as a task.",
          type: "string",
        },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama import_task_from_calendar_event MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "accept_meeting_invite",
    description: "Confirms attendance to a meeting that the user is invited to.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama accept_meeting_invite MCP tool.",
      type: "object",
      properties: {
        eventId: {
          description: "The unique ID of the calendar event to accept the meeting invite for.",
          type: "string",
        },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama accept_meeting_invite MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "decline_meeting_invite",
    description: "Decline attendance to a meeting that the user is invited to.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama decline_meeting_invite MCP tool.",
      type: "object",
      properties: {
        eventId: {
          description: "The unique ID of the calendar event to decline the meeting invite for.",
          type: "string",
        },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama decline_meeting_invite MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "set_calendar_event_allow_task_projections",
    description:
      "Sets whether tasks are allowed to be automatically projected (scheduled) at the same time as a calendar event. When set to true, tasks can be automatically projected during the event. When set to false, tasks cannot be automatically projected during the event. Note: This only affects automatic projections; users can still manually timebox tasks during this event.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama set_calendar_event_allow_task_projections MCP tool.",
      type: "object",
      properties: {
        eventId: {
          description: "The unique ID of the calendar event to set task projection settings for.",
          type: "string",
        },
        allowTasksProjectedAtSameTime: {
          description:
            "If true, allows tasks to be automatically projected at the same time as this event. If false, blocks tasks from being automatically projected at the same time as this event. Note: This only affects automatic projections; manual timeboxing is not affected.",
          type: "boolean",
        },
      },
      required: ["eventId", "allowTasksProjectedAtSameTime"],
      additionalProperties: false,
    },
    outputSchema: s.object(
      "The normalized result returned by the Sunsama set_calendar_event_allow_task_projections MCP tool.",
      {
        result: s.unknown(
          "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
        ),
      },
    ),
  }),
  defineProviderAction(service, {
    name: "toggle_auto_import_events",
    description: "Enables or disables automatic importing of calendar events to the daily task list.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama toggle_auto_import_events MCP tool.",
      type: "object",
      properties: {
        enabled: {
          description: "Whether to enable (true) or disable (false) automatic importing of calendar events.",
          type: "boolean",
        },
      },
      required: ["enabled"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama toggle_auto_import_events MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "update_import_event_filters",
    description:
      "Updates the exclusion filters that determine which calendar events are excluded from automatic import. Events matching any of these filters will NOT be automatically imported.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama update_import_event_filters MCP tool.",
      type: "object",
      properties: {
        excludedEventFilters: {
          description:
            'An array of exclusion filter types. Events matching any of these filters will be EXCLUDED from auto-import. Available filters: "solo" (events with no other invitees), "transparent" (non-blocking events), "hold" (events with HOLD/OOO/Focus time in title), "unconfirmed" (unconfirmed meeting invites), "multi-day-all-day" (multi-day all-day events), "single-day-all-day" (single-day all-day events).',
          type: "array",
          items: {
            type: "string",
            enum: ["solo", "transparent", "hold", "unconfirmed", "multi-day-all-day", "single-day-all-day"],
          },
        },
      },
      required: ["excludedEventFilters"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama update_import_event_filters MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "update_calendar_preferences",
    description:
      "Updates preferences for a specific calendar including whether it is the default for tasks, default for events, and whether it is included in auto-importing of events.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama update_calendar_preferences MCP tool.",
      type: "object",
      properties: {
        calendarId: {
          description: "The ID of the calendar to update preferences for.",
          type: "string",
        },
        isDefaultForTasks: {
          description:
            "Whether this calendar should be the default calendar for timeboxing tasks. If not provided, this preference will not be changed.",
          type: "boolean",
        },
        isDefaultForEvents: {
          description:
            "Whether this calendar should be the default calendar for scheduling events. If not provided, this preference will not be changed.",
          type: "boolean",
        },
        includedInAutoImportingOfEvents: {
          description:
            "Whether this calendar should be included in automatic importing of calendar events. If not provided, this preference will not be changed.",
          type: "boolean",
        },
      },
      required: ["calendarId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama update_calendar_preferences MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "create_weekly_objective",
    description: "Creates a new weekly objective.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama create_weekly_objective MCP tool.",
      type: "object",
      properties: {
        title: {
          description: "The title of the weekly objective.",
          type: "string",
        },
        weekStartDay: {
          description: "The start day of the week in YYYY-MM-DD format.",
          type: "string",
        },
        timeEstimate: {
          description: "The estimated time in minutes for the objective.",
          type: "number",
        },
        channel: {
          description:
            "The channel name to associate with the objective. This does not need to be perfect. The closest match will be used.",
          type: "string",
        },
      },
      required: ["title", "weekStartDay"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama create_weekly_objective MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_daily_highlights",
    description:
      "Gets a list of daily highlights (end of day journal entries of your work day) for the user. Returns published daily wraps in Markdown format. If startDate and endDate are omitted, returns only the most recent one.",
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama get_daily_highlights MCP tool.",
      type: "object",
      properties: {
        startDate: {
          description:
            "Start of the date range (YYYY-MM-DD). Inclusive. If omitted, returns only the last daily highlight.",
          type: "string",
        },
        endDate: {
          description:
            "End of the date range (YYYY-MM-DD). Inclusive. If omitted, returns only the last daily highlight.",
          type: "string",
        },
      },
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama get_daily_highlights MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "set_shutdown_time",
    description: "Sets the shutdown time for a specific day.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama set_shutdown_time MCP tool.",
      type: "object",
      properties: {
        calendarDay: {
          description: "The day to set the shutdown time for, in YYYY-MM-DD format.",
          type: "string",
        },
        hour: {
          description: "Hour of the shutdown time (0-23)",
          type: "number",
        },
        minute: {
          description: "Minute of the shutdown time (0-59)",
          type: "number",
        },
        addToTheCalendar: {
          description: "Whether to create a shutdown task and calendar event for the day.",
          default: false,
          type: "boolean",
        },
      },
      required: ["calendarDay", "hour", "minute"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama set_shutdown_time MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "create_channel",
    description: "Creates a new channel for the user.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama create_channel MCP tool.",
      type: "object",
      properties: {
        channelName: {
          description: "The name of the channel to create.",
          type: "string",
        },
        categoryName: {
          description:
            "The name of the category this should belong to. If not provided one will be assigned automatically.",
          type: "string",
        },
        isPersonal: {
          default: false,
          description:
            "Whether the channel is a personal channel. If not provided it will be assumed to be a work channel. This option is ignored if a category name is provided.",
          type: "boolean",
        },
      },
      required: ["channelName"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama create_channel MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "rename_channel",
    description:
      "Renames one of the user's channels. Takes a channel ID, not a channel name — use the search_channels tool to resolve a name the user mentions into an ID first. Renaming only changes the channel's label; the tasks, objectives, and calendar events assigned to it stay assigned.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama rename_channel MCP tool.",
      type: "object",
      properties: {
        channelId: {
          description: "The ID of the channel to rename.",
          type: "string",
        },
        newName: {
          description: "The new name for the channel.",
          type: "string",
        },
      },
      required: ["channelId", "newName"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama rename_channel MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_channel",
    description:
      "Deletes one of the user's channels. Takes a channel ID, not a channel name — use the search_channels tool to resolve a name the user mentions into an ID first. Tasks, objectives, and calendar events in the channel are not deleted, but they lose their channel assignment and cannot be reassigned by undoing this. Deleting a category also uncategorizes the channels inside it. This cannot be undone, so confirm with the user before calling it.",
    requiredScopes: ["execute"],
    inputSchema: {
      description: "Arguments for the Sunsama delete_channel MCP tool.",
      type: "object",
      properties: {
        channelId: {
          description: "The ID of the channel to delete.",
          type: "string",
        },
      },
      required: ["channelId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama delete_channel MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "search_channels",
    description:
      'Searches the user\'s channels by meaning, not just by exact name. Returns the closest matching channels ordered by relevance, so "client work" can match a channel named "Acme Corp". Use this to resolve a channel a user mentions into a channel ID before assigning tasks to it.',
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama search_channels MCP tool.",
      type: "object",
      properties: {
        searchText: {
          description: "What to search for, e.g. a channel name, project, or client.",
          type: "string",
        },
        numResults: {
          default: 5,
          description: "How many matching channels to return, ordered by relevance.",
          type: "integer",
          minimum: 1,
          maximum: 25,
        },
        isPersonal: {
          description: "Restrict the search to personal channels (true) or work channels (false). Omit to search both.",
          type: "boolean",
        },
        isCategory: {
          description:
            "Restrict the search to categories (true) or to channels inside a category (false). Omit to search both.",
          type: "boolean",
        },
        categoryStreamId: {
          description: "Restrict the search to channels belonging to this category channel ID.",
          type: "string",
        },
      },
      required: ["searchText"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama search_channels MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_resources",
    description:
      "Lists all available resources and resource templates exposed by this MCP server. Use this tool to discover what data sources are available when the client doesn't support the MCP resources protocol natively.\n\nReturns an array of resources, where each resource has:\n- name: The resource identifier\n- uri: The static URI (for fixed resources) OR uri_template (for parameterized resources)\n- description: What the resource provides\n- mimeType: The content type returned",
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama list_resources MCP tool.",
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama list_resources MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "read_resource",
    description:
      'Reads a specific resource by URI. Use this tool to fetch data from resources when the client doesn\'t support the MCP resources protocol natively.\n\nFor static resources, pass the exact URI from list_resources.\nFor templated resources, fill in the placeholders with actual values.\n\nExample: If list_resources shows uri_template "sunsama://tasks/{calendarDay}", \nyou would call this with uri "sunsama://tasks/2025-01-15" to get tasks for that day.',
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama read_resource MCP tool.",
      type: "object",
      properties: {
        uri: {
          description: "The resource URI to read. For templates, fill in the placeholder values.",
          type: "string",
        },
      },
      required: ["uri"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama read_resource MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_help_articles",
    description:
      'Lists Sunsama\'s help center articles as a catalog: each entry has an id, title, description, category, and url. Use this whenever the user asks how a Sunsama feature works, what Sunsama can or cannot do, or whenever you are unsure about product behavior or a limitation. Pick the most relevant article from the list, then call "get_help_article" with its id to read it and answer from the docs instead of guessing. You can also share the article url with the user.',
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama list_help_articles MCP tool.",
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama list_help_articles MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_help_article",
    description:
      'Fetches the full text of a single Sunsama help center article. First call "list_help_articles" to find the relevant article, then pass its id here. Returns the article title, url, and plain-text body so you can answer the user\'s question from the docs.',
    requiredScopes: ["read"],
    inputSchema: {
      description: "Arguments for the Sunsama get_help_article MCP tool.",
      type: "object",
      properties: {
        articleId: {
          description:
            'The id of the article to fetch, exactly as returned in the "id" field by the list_help_articles tool (e.g. "getting-started/basics/task-basics").',
          type: "string",
        },
      },
      required: ["articleId"],
      additionalProperties: false,
    },
    outputSchema: s.object("The normalized result returned by the Sunsama get_help_article MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
