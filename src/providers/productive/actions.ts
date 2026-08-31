import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "productive";
const id = s.nonEmptyString("The Productive resource ID.");
const jsonApiResource = s.looseObject("A Productive JSON:API resource with upstream fields preserved.");
const included = s.array("Included Productive JSON:API resources.", jsonApiResource);
const pageInput = {
  pageNumber: s.integer("The 1-based Productive page number.", { minimum: 1 }),
  pageSize: s.integer("The number of Productive records per page. Productive allows up to 200.", {
    minimum: 1,
    maximum: 200,
  }),
  sort: s.nonEmptyString("The Productive sort expression, such as title or -title."),
  filter: s.record("Productive filter values keyed by official filter field name.", s.unknown("One filter value.")),
  include: s.nonEmptyString("Comma-separated Productive relationship names to include."),
};
const relationship = s.object("A Productive JSON:API relationship object.", {
  type: s.nonEmptyString("The Productive relationship resource type."),
  id,
});
const relationships = s.record("Productive relationship values keyed by relationship name.", relationship);
const attributes = s.looseObject("Additional Productive JSON:API attributes.");

export const productiveActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Productive tasks with optional pagination, sorting, filters, and includes.",
    inputSchema: s.object("Query parameters for listing Productive tasks.", pageInput, {
      optional: ["pageNumber", "pageSize", "sort", "filter", "include"],
    }),
    outputSchema: s.looseObject("The normalized Productive task list output.", {
      tasks: s.array("The Productive tasks returned for this page.", jsonApiResource),
      included,
      links: s.looseObject("Pagination links returned by Productive."),
      meta: s.looseObject("Pagination metadata returned by Productive."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Retrieve one Productive task by ID.",
    inputSchema: s.object(
      "The Productive task lookup payload.",
      {
        taskId: id,
        include: s.nonEmptyString("Comma-separated Productive relationship names to include."),
      },
      { optional: ["include"] },
    ),
    outputSchema: s.looseObject("The normalized Productive task output.", { task: jsonApiResource, included }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a Productive task using JSON:API attributes and relationships.",
    inputSchema: s.object(
      "The Productive task creation payload.",
      {
        title: s.nonEmptyString("The Productive task title."),
        description: s.nonEmptyString("The optional Productive task description."),
        dueDate: s.date("The optional Productive task due date."),
        relationships,
        attributes,
      },
      { optional: ["description", "dueDate", "relationships", "attributes"] },
    ),
    outputSchema: s.looseObject("The normalized Productive task output.", { task: jsonApiResource, included }),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Productive task by ID.",
    inputSchema: s.object(
      "The Productive task update payload.",
      {
        taskId: id,
        title: s.nonEmptyString("The optional Productive task title."),
        description: s.nullableString("The optional Productive task description."),
        dueDate: s.nullable(s.date("The optional Productive task due date.")),
        relationships,
        attributes,
      },
      { optional: ["title", "description", "dueDate", "relationships", "attributes"] },
    ),
    outputSchema: s.looseObject("The normalized Productive task output.", { task: jsonApiResource, included }),
  }),
  defineProviderAction(service, {
    name: "list_time_entries",
    description: "List Productive time entries with optional pagination, sorting, filters, and includes.",
    inputSchema: s.object("Query parameters for listing Productive time entries.", pageInput, {
      optional: ["pageNumber", "pageSize", "sort", "filter", "include"],
    }),
    outputSchema: s.looseObject("The normalized Productive time entry list output.", {
      timeEntries: s.array("The Productive time entries returned for this page.", jsonApiResource),
      included,
      links: s.looseObject("Pagination links returned by Productive."),
      meta: s.looseObject("Pagination metadata returned by Productive."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_time_entry",
    description: "Create a Productive time entry for a person and service.",
    inputSchema: s.object(
      "The Productive time entry creation payload.",
      {
        date: s.date("The Productive time entry date."),
        time: s.positiveInteger("The Productive time entry duration in minutes."),
        personId: id,
        serviceId: id,
        note: s.nonEmptyString("The optional Productive time entry note."),
        billable: s.boolean("Whether the Productive time entry is billable."),
        relationships,
        attributes,
      },
      { optional: ["note", "billable", "relationships", "attributes"] },
    ),
    outputSchema: s.looseObject("The normalized Productive time entry output.", {
      timeEntry: jsonApiResource,
      included,
    }),
  }),
  defineProviderAction(service, {
    name: "update_time_entry",
    description: "Update a Productive time entry by ID.",
    inputSchema: s.object(
      "The Productive time entry update payload.",
      {
        timeEntryId: id,
        date: s.date("The optional Productive time entry date."),
        time: s.positiveInteger("The optional Productive time entry duration in minutes."),
        note: s.nullableString("The optional Productive time entry note."),
        billable: s.boolean("Whether the Productive time entry is billable."),
        relationships,
        attributes,
      },
      { optional: ["date", "time", "note", "billable", "relationships", "attributes"] },
    ),
    outputSchema: s.looseObject("The normalized Productive time entry output.", {
      timeEntry: jsonApiResource,
      included,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_time_entry",
    description: "Delete a Productive time entry by ID.",
    inputSchema: s.object("The Productive time entry deletion payload.", { timeEntryId: id }),
    outputSchema: s.object("The generic Productive success output.", {
      success: s.boolean("Whether the Productive operation succeeded."),
    }),
  }),
];
