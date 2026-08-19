import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "everhour";

const projectIdSchema = s.nonEmptyString("The Everhour project ID.");
const taskIdSchema = s.nonEmptyString("The Everhour task ID.");
const userIdSchema = s.positiveInteger("The Everhour user ID.");
const positiveLimitSchema = s.positiveInteger("The maximum number of records to return.");
const pageSchema = s.positiveInteger("The 1-based page number to request.");
const isoDateSchema = s.date("An ISO 8601 date string in YYYY-MM-DD format.");
const userSchema = s.looseObject("An Everhour user record.", {
  id: userIdSchema,
  name: s.nonEmptyString("The Everhour user name."),
  role: s.stringEnum("The Everhour user role.", ["admin", "supervisor", "member"]),
  status: s.stringEnum("The Everhour user status.", ["active", "invited", "pending", "removed"]),
});
const projectSchema = s.looseObject("An Everhour project record.", {
  id: projectIdSchema,
  name: s.nonEmptyString("The Everhour project name."),
});
const taskSchema = s.looseObject("An Everhour task record.", {
  id: taskIdSchema,
  name: s.nonEmptyString("The Everhour task name."),
  projects: s.array("The Everhour project IDs linked to the task.", projectIdSchema),
});
const timeRecordSchema = s.looseObject("An Everhour time record.", {
  id: s.positiveInteger("The Everhour time record ID."),
  time: s.integer("The tracked duration in seconds."),
  user: userIdSchema,
  date: isoDateSchema,
  task: taskSchema,
});
const timerSchema = s.looseObject("An Everhour timer record.", {
  status: s.stringEnum("The Everhour timer status.", ["active", "stopped"]),
  duration: s.integer("The running duration in seconds."),
  today: s.integer("The total tracked time for the timer's day in seconds."),
  task: taskSchema,
  user: userSchema,
});

export const everhourActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Everhour user profile associated with the API key.",
    inputSchema: s.object("Input parameters for reading the current Everhour user.", {}),
    outputSchema: s.object("Everhour current user response wrapper.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List the users in the Everhour team that the API key can access.",
    inputSchema: s.object("Input parameters for listing Everhour users.", {}),
    outputSchema: s.object("Everhour users list response wrapper.", {
      users: s.array("The Everhour users returned for the current team.", userSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Everhour projects with optional text, platform, and limit filters.",
    inputSchema: s.object(
      "Input parameters for listing Everhour projects.",
      {
        query: s.nonEmptyString("Filter projects by project name text."),
        limit: positiveLimitSchema,
        platform: s.nonEmptyString("The Everhour platform slug used to filter integration-backed projects."),
      },
      { optional: ["query", "limit", "platform"] },
    ),
    outputSchema: s.object("Everhour projects list response wrapper.", {
      projects: s.array("The Everhour projects returned for the request.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Everhour project by its project ID.",
    inputSchema: s.object("Input parameters for reading one Everhour project.", { projectId: projectIdSchema }),
    outputSchema: s.object("Everhour single project response wrapper.", { project: projectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_project_tasks",
    description: "List the tasks in one Everhour project with optional paging and search filters.",
    inputSchema: s.object(
      "Input parameters for listing tasks in one Everhour project.",
      {
        projectId: projectIdSchema,
        page: pageSchema,
        limit: positiveLimitSchema,
        query: s.nonEmptyString("Filter tasks by task name text."),
        excludeClosed: s.boolean("Whether closed tasks should be excluded from the response."),
      },
      { optional: ["page", "limit", "query", "excludeClosed"] },
    ),
    outputSchema: s.object("Everhour project tasks response wrapper.", {
      tasks: s.array("The Everhour tasks returned for the requested project.", taskSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get one Everhour task by its task ID.",
    inputSchema: s.object("Input parameters for reading one Everhour task.", { taskId: taskIdSchema }),
    outputSchema: s.object("Everhour single task response wrapper.", { task: taskSchema }),
  }),
  defineProviderAction(service, {
    name: "search_tasks",
    description: "Search Everhour tasks across accessible projects.",
    inputSchema: s.object(
      "Input parameters for searching Everhour tasks across projects.",
      {
        query: s.nonEmptyString("Task name text to search for."),
        limit: positiveLimitSchema,
        searchInClosed: s.boolean("Whether closed tasks should be included in the search results."),
      },
      { optional: ["limit", "searchInClosed"] },
    ),
    outputSchema: s.object("Everhour task search response wrapper.", {
      tasks: s.array("The Everhour tasks matching the search query.", taskSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_time_records",
    description: "List Everhour team time records with optional date range and paging filters.",
    inputSchema: s.object(
      "Input parameters for listing Everhour team time records.",
      {
        from: isoDateSchema,
        to: isoDateSchema,
        page: pageSchema,
        limit: positiveLimitSchema,
      },
      { optional: ["from", "to", "page", "limit"] },
    ),
    outputSchema: s.object("Everhour time records response wrapper.", {
      timeRecords: s.array("The Everhour time records returned for the request.", timeRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_time_record",
    description: "Create one Everhour time record with a duration, date, and optional task or user assignment.",
    inputSchema: s.object(
      "Input parameters for creating one Everhour time record.",
      {
        time: s.positiveInteger("The duration to log in seconds."),
        date: isoDateSchema,
        taskId: taskIdSchema,
        userId: userIdSchema,
        comment: s.nonEmptyString("An optional comment to save on the time record."),
      },
      { optional: ["taskId", "userId", "comment"] },
    ),
    outputSchema: s.object("Everhour created time record response wrapper.", { timeRecord: timeRecordSchema }),
  }),
  defineProviderAction(service, {
    name: "start_timer",
    description: "Start an Everhour timer for a task with an optional user date and comment.",
    inputSchema: s.object(
      "Input parameters for starting an Everhour timer.",
      {
        taskId: taskIdSchema,
        userDate: isoDateSchema,
        comment: s.nonEmptyString("An optional comment to save on the running timer."),
      },
      { optional: ["userDate", "comment"] },
    ),
    outputSchema: s.object("Everhour timer response wrapper.", { timer: timerSchema }),
  }),
  defineProviderAction(service, {
    name: "get_current_timer",
    description: "Get the current running Everhour timer.",
    inputSchema: s.object("Input parameters for reading the current Everhour timer.", {}),
    outputSchema: s.object("Everhour timer response wrapper.", { timer: timerSchema }),
  }),
  defineProviderAction(service, {
    name: "stop_timer",
    description: "Stop the current Everhour timer and return the final timer snapshot.",
    inputSchema: s.object("Input parameters for stopping the current Everhour timer.", {}),
    outputSchema: s.object("Everhour timer response wrapper.", { timer: timerSchema }),
  }),
];
