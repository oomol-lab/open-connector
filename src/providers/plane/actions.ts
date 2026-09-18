import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "plane";

const workspaceSlug = s.nonEmptyString(
  "Plane workspace slug, such as my-team from https://app.plane.so/my-team/projects/.",
);
const projectId = s.nonEmptyString("Plane project ID.");
const resourceId = s.nonEmptyString("Plane resource ID.");
const looseItem = s.looseObject("Raw Plane resource object returned by the API.");

const paginationFields = {
  cursor: s.nonEmptyString("Pagination cursor returned by a previous Plane list response."),
  per_page: s.integer("Number of results to request per page. Plane allows up to 100.", { minimum: 1, maximum: 100 }),
  fields: s.nonEmptyString("Comma-separated response fields to include."),
  expand: s.nonEmptyString("Comma-separated related fields to expand in the response."),
  order_by: s.nonEmptyString("Field to order by. Prefix with '-' for descending order."),
};

const paginatedOutput = s.object(
  "Paginated Plane list response.",
  {
    next_cursor: s.string("Cursor for the next page."),
    prev_cursor: s.string("Cursor for the previous page."),
    next_page_results: s.boolean("Whether another page exists after this response."),
    prev_page_results: s.boolean("Whether another page exists before this response."),
    count: s.integer("Number of resources in this page."),
    total_pages: s.integer("Estimated total page count."),
    total_results: s.integer("Estimated total resource count."),
    results: s.array("Plane resources returned in this page.", looseItem),
    grouped_by: s.string("Grouping field applied by Plane."),
    sub_grouped_by: s.string("Secondary grouping field applied by Plane."),
    total_count: s.integer("Total count returned by Plane when available."),
    extra_stats: s.looseObject("Additional statistics returned by Plane when available."),
  },
  {
    optional: [
      "grouped_by",
      "sub_grouped_by",
      "total_count",
      "extra_stats",
      "next_cursor",
      "prev_cursor",
      "next_page_results",
      "prev_page_results",
      "count",
      "total_pages",
      "total_results",
    ],
  },
);

const singleItemOutput = s.actionOutput({ item: looseItem });
const deleteOutput = s.actionOutput({ deleted: s.boolean("Whether the delete request completed successfully.") });

const workItemFields = {
  assignees: s.stringArray("Plane user IDs assigned to the work item."),
  labels: s.stringArray("Plane label IDs attached to the work item."),
  type_id: s.nonEmptyString("Plane work item type ID."),
  parent: s.nonEmptyString("Parent work item ID."),
  deleted_at: s.nonEmptyString("Deletion timestamp."),
  point: s.integer("Story point value."),
  name: s.nonEmptyString("Work item title."),
  description_html: s.string("Work item description in HTML."),
  description_stripped: s.string("Plain-text work item description."),
  priority: s.stringEnum("Work item priority.", ["urgent", "high", "medium", "low", "none"]),
  start_date: s.nonEmptyString("Work item start date."),
  target_date: s.nonEmptyString("Work item target date."),
  sequence_id: s.integer("Plane sequence ID."),
  sort_order: s.number("Sort order value."),
  completed_at: s.nonEmptyString("Completion timestamp."),
  archived_at: s.nonEmptyString("Archive timestamp."),
  last_activity_at: s.nonEmptyString("Last activity timestamp."),
  is_draft: s.boolean("Whether the work item is a draft."),
  external_source: s.nonEmptyString("External system source name."),
  external_id: s.nonEmptyString("External system identifier."),
  created_by: s.nonEmptyString("Plane user ID that created the work item."),
  state: s.nonEmptyString("Plane state ID."),
  estimate_point: s.nonEmptyString("Plane estimate point ID."),
  type: s.nonEmptyString("Plane work item type."),
};

const projectScopedInput = s.actionInput(
  {
    workspace_slug: workspaceSlug,
    project_id: projectId,
    ...paginationFields,
  },
  ["workspace_slug", "project_id"],
);

export const planeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the authenticated Plane user's profile.",
    inputSchema: s.actionInput({}),
    outputSchema: singleItemOutput,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Plane projects in a workspace.",
    inputSchema: s.actionInput({ workspace_slug: workspaceSlug, ...paginationFields }, ["workspace_slug"]),
    outputSchema: paginatedOutput,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Retrieve a Plane project by ID.",
    inputSchema: s.actionInput({ workspace_slug: workspaceSlug, project_id: projectId }, [
      "workspace_slug",
      "project_id",
    ]),
    outputSchema: singleItemOutput,
  }),
  defineProviderAction(service, {
    name: "list_work_items",
    operationType: "read",
    description: "List Plane work items in a project with pagination and optional filters.",
    inputSchema: s.actionInput(
      {
        workspace_slug: workspaceSlug,
        project_id: projectId,
        external_id: s.nonEmptyString("External system identifier for filtering work items."),
        external_source: s.nonEmptyString("External system source name for filtering work items."),
        ...paginationFields,
      },
      ["workspace_slug", "project_id"],
    ),
    outputSchema: paginatedOutput,
  }),
  defineProviderAction(service, {
    name: "get_work_item",
    operationType: "read",
    description: "Retrieve a Plane work item by ID.",
    inputSchema: s.actionInput(
      {
        workspace_slug: workspaceSlug,
        project_id: projectId,
        work_item_id: resourceId,
        fields: paginationFields.fields,
        expand: paginationFields.expand,
        order_by: paginationFields.order_by,
        external_id: s.nonEmptyString("External system identifier for lookup validation."),
        external_source: s.nonEmptyString("External system source name for lookup validation."),
      },
      ["workspace_slug", "project_id", "work_item_id"],
    ),
    outputSchema: singleItemOutput,
  }),
  defineProviderAction(service, {
    name: "create_work_item",
    operationType: "write",
    description: "Create a Plane work item in a project.",
    inputSchema: s.actionInput({ workspace_slug: workspaceSlug, project_id: projectId, ...workItemFields }, [
      "workspace_slug",
      "project_id",
      "name",
    ]),
    outputSchema: singleItemOutput,
  }),
  defineProviderAction(service, {
    name: "update_work_item",
    operationType: "write",
    description: "Update a Plane work item by ID.",
    inputSchema: s.actionInput(
      { workspace_slug: workspaceSlug, project_id: projectId, work_item_id: resourceId, ...workItemFields },
      ["workspace_slug", "project_id", "work_item_id"],
    ),
    outputSchema: singleItemOutput,
  }),
  defineProviderAction(service, {
    name: "delete_work_item",
    operationType: "destructive",
    description: "Delete a Plane work item by ID.",
    inputSchema: s.actionInput({ workspace_slug: workspaceSlug, project_id: projectId, work_item_id: resourceId }, [
      "workspace_slug",
      "project_id",
      "work_item_id",
    ]),
    outputSchema: deleteOutput,
  }),
  defineProviderAction(service, {
    name: "list_states",
    operationType: "read",
    description: "List workflow states for a Plane project.",
    inputSchema: projectScopedInput,
    outputSchema: paginatedOutput,
  }),
  defineProviderAction(service, {
    name: "list_labels",
    operationType: "read",
    description: "List labels for a Plane project.",
    inputSchema: projectScopedInput,
    outputSchema: paginatedOutput,
  }),
  defineProviderAction(service, {
    name: "list_project_members",
    operationType: "read",
    description: "List members of a Plane project.",
    inputSchema: projectScopedInput,
    outputSchema: s.actionOutput({ members: s.array("Plane project members.", looseItem) }),
  }),
];
