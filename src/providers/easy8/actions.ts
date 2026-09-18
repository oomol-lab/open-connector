import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "easy8";

const id = s.positiveInteger("The numeric Easy8 resource ID.");
const pagination = {
  query: s.string("A free-text Easy8 query."),
  limit: s.integer("The maximum number of records to return, up to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  offset: s.integer("The zero-based result offset.", { minimum: 0 }),
};
const project = s.looseObject("An Easy8 project object.", {
  id,
  name: s.string("The project name."),
  identifier: s.string("The project identifier."),
});
const issue = s.looseObject("An Easy8 task object.", {
  id,
  subject: s.string("The task subject."),
  description: s.string("The task description."),
});
const listMeta = {
  totalCount: s.integer("The total number of matching records."),
  offset: s.integer("The result offset returned by Easy8."),
  limit: s.integer("The result limit returned by Easy8."),
};
const projectWriteFields = {
  name: s.nonEmptyString("The project name."),
  authorId: id,
  description: s.string("The project description."),
  parentId: id,
  managerId: id,
  ownerId: id,
  planned: s.boolean("Whether the project is planned."),
  startDate: s.string("The project start date in YYYY-MM-DD format.", { format: "date" }),
  dueDate: s.string("The project due date in YYYY-MM-DD format.", { format: "date" }),
  currencyCode: s.string("The three-letter project currency code.", { minLength: 3, maxLength: 3 }),
  tags: s.array("Tags assigned to the project.", s.string("A project tag.")),
};
const issueWriteFields = {
  subject: s.nonEmptyString("The task subject."),
  projectId: id,
  trackerId: id,
  statusId: id,
  priorityId: id,
  authorId: id,
  assigneeId: id,
  description: s.string("The task description."),
  estimatedHours: s.string("The estimated hours value accepted by Easy8."),
  doneRatio: s.integer("The task completion percentage in ten-point steps.", {
    minimum: 0,
    maximum: 100,
  }),
  startDate: s.string("The task start date in YYYY-MM-DD format.", { format: "date" }),
  dueDate: s.string("The task due date in YYYY-MM-DD format.", { format: "date" }),
  private: s.boolean("Whether the task is private."),
  parentIssueId: id,
  notes: s.string("A comment to add while updating the task."),
  tags: s.array("Tags assigned to the task.", s.string("A task tag.")),
};

export const easy8Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List projects visible to the connected Easy8 user.",
    requiredScopes: [],
    inputSchema: s.object("The input for listing Easy8 projects.", pagination, {
      optional: ["query", "limit", "offset"],
    }),
    outputSchema: s.object("The Easy8 project list response.", {
      projects: s.array("Projects returned by Easy8.", project),
      ...listMeta,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Retrieve one Easy8 project by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving an Easy8 project.", { projectId: id }),
    outputSchema: s.object("The Easy8 project response.", { project }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create an Easy8 project.",
    requiredScopes: [],
    inputSchema: s.object("The input for creating an Easy8 project.", projectWriteFields, {
      optional: [
        "description",
        "parentId",
        "managerId",
        "ownerId",
        "planned",
        "startDate",
        "dueDate",
        "currencyCode",
        "tags",
      ],
    }),
    outputSchema: s.object("The created Easy8 project response.", { project }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    operationType: "write",
    description: "Update documented fields on an Easy8 project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating an Easy8 project.",
      { projectId: id, ...projectWriteFields },
      {
        optional: [
          "name",
          "authorId",
          "description",
          "parentId",
          "managerId",
          "ownerId",
          "planned",
          "startDate",
          "dueDate",
          "currencyCode",
          "tags",
        ],
      },
    ),
    outputSchema: s.object("The updated Easy8 project response.", { project }),
  }),
  defineProviderAction(service, {
    name: "list_issues",
    operationType: "read",
    description: "List tasks visible to the connected Easy8 user.",
    requiredScopes: [],
    inputSchema: s.object("The input for listing Easy8 tasks.", pagination, {
      optional: ["query", "limit", "offset"],
    }),
    outputSchema: s.object("The Easy8 task list response.", {
      issues: s.array("Tasks returned by Easy8.", issue),
      ...listMeta,
    }),
  }),
  defineProviderAction(service, {
    name: "get_issue",
    operationType: "read",
    description: "Retrieve one Easy8 task by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving an Easy8 task.", { issueId: id }),
    outputSchema: s.object("The Easy8 task response.", { issue }),
  }),
  defineProviderAction(service, {
    name: "create_issue",
    operationType: "write",
    description: "Create an Easy8 task.",
    requiredScopes: [],
    inputSchema: s.object("The input for creating an Easy8 task.", issueWriteFields, {
      optional: [
        "description",
        "estimatedHours",
        "doneRatio",
        "startDate",
        "dueDate",
        "private",
        "parentIssueId",
        "notes",
        "tags",
      ],
    }),
    outputSchema: s.object("The created Easy8 task response.", { issue }),
  }),
  defineProviderAction(service, {
    name: "update_issue",
    operationType: "write",
    description: "Update documented fields on an Easy8 task.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating an Easy8 task.",
      { issueId: id, ...issueWriteFields },
      {
        optional: [
          "subject",
          "projectId",
          "trackerId",
          "statusId",
          "priorityId",
          "authorId",
          "assigneeId",
          "description",
          "estimatedHours",
          "doneRatio",
          "startDate",
          "dueDate",
          "private",
          "parentIssueId",
          "notes",
          "tags",
        ],
      },
    ),
    outputSchema: s.object("The updated Easy8 task response.", { issue }),
  }),
  defineProviderAction(service, {
    name: "delete_issue",
    operationType: "destructive",
    description: "Permanently delete an Easy8 task.",
    requiredScopes: [],
    inputSchema: s.object("The input for deleting an Easy8 task.", { issueId: id }),
    outputSchema: s.object("The Easy8 task deletion response.", {
      deleted: s.boolean("Whether Easy8 accepted the deletion."),
    }),
  }),
];
