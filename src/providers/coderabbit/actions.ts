import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coderabbit";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const nullableString = (description: string): JsonSchema => s.nullable(s.string(description));
const seatFilterSchema = s.stringEnum(["all", "assigned", "unassigned"], {
  description: "Filter users by seat assignment status.",
});
const roleFilterSchema = s.stringEnum(["all", "member", "admin"], {
  description: "Filter users by organization role.",
});
const seatAssignmentModeSchema = s.stringEnum(["automatic", "manual"], {
  description: "The CodeRabbit seat assignment mode.",
});
const userRoleSchema = s.stringEnum(["cr_admin", "cr_member"], {
  description: "The CodeRabbit user role.",
});
const accessTypeSchema = s.stringEnum(["read", "write", "delete"], {
  description: "The CodeRabbit role permission access type.",
});
const roleTypeSchema = s.stringEnum(["all", "system", "custom"], {
  description: "Filter roles by built-in or custom type.",
});

function stringArraySchema(
  description: string,
  itemDescription: string,
  options: { minItems?: number; maxItems?: number } = {},
): JsonSchema {
  return s.array(description, nonEmptyString(itemDescription), options);
}

const jsonObjectSchema = s.looseObject("A CodeRabbit object returned by the API.");
const rawSchema = s.looseObject("The raw CodeRabbit response object.");

const userSchema = s.looseObject("A CodeRabbit organization user.", {
  user_id: nonEmptyString("The unique user identifier assigned by the Git provider."),
  seat_assigned: s.boolean("Whether the user has a CodeRabbit seat assigned."),
  role: s.string("The user's CodeRabbit role."),
});

const bulkFailureSchema = s.looseObject("A failed CodeRabbit bulk operation item.", {
  id: nonEmptyString("The user identifier that failed."),
  code: nonEmptyString("The CodeRabbit error code for this failed item."),
});

const bulkOperationResponseSchema = s.object("The response returned by a CodeRabbit bulk user operation.", {
  status: s.stringEnum(["success", "partial_success", "failure"], {
    description: "The bulk operation status.",
  }),
  succeeded: stringArraySchema(
    "The user identifiers that were successfully processed.",
    "One successful user identifier.",
  ),
  failed: s.array("The failed user operations.", bulkFailureSchema),
});

const commentCountSchema = s.looseObject("A CodeRabbit comment count bucket.", {
  posted: s.integer("The number of comments posted."),
  accepted: s.integer("The number of comments accepted."),
});

const reviewMetricSchema = s.looseObject("A CodeRabbit pull request review metric.", {
  pr_url: s.string("The full URL to the pull request."),
  author_id: s.string("The unique author identifier assigned by the Git provider."),
  author_username: s.string("The pull request author's username."),
  organization_id: s.string("The unique organization identifier assigned by the Git provider."),
  organization_name: s.string("The organization name."),
  repository_id: s.string("The unique repository identifier assigned by the Git provider."),
  repository_name: s.string("The repository name."),
  created_at: s.string("The timestamp when the pull request was created."),
  ready_for_review_at: s.nullable(s.string("The timestamp when the pull request became ready for review.")),
  first_human_review_at: s.nullable(s.string("The timestamp when the first human review was submitted.")),
  last_commit_at: s.nullable(s.string("The timestamp when the last commit was pushed.")),
  merged_at: s.nullable(s.string("The timestamp when the pull request was merged.")),
  estimated_complexity: s.nullable(s.integer("The estimated review complexity score.")),
  estimated_review_minutes: s.nullable(s.integer("The estimated time to review the pull request in minutes.")),
  coderabbit_comments: s.looseObject("The CodeRabbit comment metrics.", {
    total: commentCountSchema,
    severity: s.looseObject("The CodeRabbit comment metrics grouped by severity."),
    category: s.looseObject("The CodeRabbit comment metrics grouped by category."),
  }),
});

const actorSchema = s.looseObject("The actor that performed an audit log action.", {
  name: s.string("The display name of the actor."),
  subtitle: s.string("The actor role label or actor type."),
  isBot: s.boolean("Whether the actor is a bot."),
  avatarUrl: s.nullable(s.string("The actor avatar URL when available.")),
});

const auditLogEntrySchema = s.looseObject("A CodeRabbit organization audit log entry.", {
  id: s.string("The audit log entry identifier."),
  action: s.string("The audit log action key."),
  actionLabel: s.string("The human-readable action label."),
  resourceType: s.string("The affected resource type key."),
  resourceTypeLabel: s.string("The human-readable resource type label."),
  resourceSummary: s.string("The short description of the affected resource."),
  actor: actorSchema,
  metadata: s.nullable(jsonObjectSchema),
  ipAddress: s.nullable(s.string("The IP address that triggered the action.")),
  createdAt: s.string("The ISO 8601 timestamp when the action occurred."),
  relativeTime: s.string("The human-readable relative event time."),
});

const paginationSchema = s.looseObject("The CodeRabbit pagination metadata.", {
  page: s.integer("The current page number."),
  page_size: s.integer("The number of results per page."),
  total_count: s.integer("The total number of matching entries."),
  total_pages: s.integer("The total number of pages."),
  has_next_page: s.boolean("Whether a next page is available."),
  has_previous_page: s.boolean("Whether a previous page is available."),
});

const filterOptionSchema = s.looseObject("A CodeRabbit audit log filter option.", {
  value: s.string("The filter option value."),
  label: s.string("The filter option label."),
  count: s.integer("The number of entries matching this option."),
});

const permissionSchema = s.object(
  "A CodeRabbit role permission.",
  {
    resource_id: nonEmptyString("The CodeRabbit permission resource identifier."),
    access_type: accessTypeSchema,
  },
  { required: ["resource_id", "access_type"] },
);

const roleSchema = s.looseObject("A CodeRabbit role.", {
  id: s.string("The CodeRabbit role identifier."),
  name: s.string("The CodeRabbit role name."),
  description: nullableString("The CodeRabbit role description."),
  is_default: s.nullable(s.boolean("Whether this role is the organization default role.")),
  permissions: s.array("The permissions attached to this role.", permissionSchema),
  user_count: s.nullable(s.integer("The number of users assigned to this role.")),
});

const roleOutputSchema = s.object("The response returned with a CodeRabbit role.", {
  role: roleSchema,
  raw: rawSchema,
});

const createRoleFields = {
  orgId: nonEmptyString("The git-provider organization ID for workspace-scoped API tokens."),
  name: nonEmptyString("The name of the custom role."),
  description: s.nullable(s.string("The description of the custom role.")),
  isDefault: s.boolean("Whether the new role should become the subscription default."),
  duplicateFrom: nonEmptyString("The role ID to copy permissions from."),
  permissions: s.array("The permissions to assign to the custom role.", permissionSchema),
};

const updateRoleFields = {
  orgId: nonEmptyString("The git-provider organization ID for workspace-scoped API tokens."),
  roleId: nonEmptyString("The CodeRabbit role identifier."),
  name: nonEmptyString("The updated custom role name."),
  description: s.nullable(s.string("The updated custom role description.")),
  isDefault: s.boolean("Whether this role should become the subscription default."),
  permissions: s.array("The updated permissions to assign to the custom role.", permissionSchema),
};

export const coderabbitActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description:
      "List CodeRabbit organization users with optional seat and role filters using cursor-based pagination.",
    inputSchema: s.object(
      "The input payload for listing CodeRabbit users.",
      {
        seatFilter: seatFilterSchema,
        roleFilter: roleFilterSchema,
        limit: s.integer("The maximum number of users to return per page.", {
          minimum: 1,
          maximum: 100,
        }),
        cursor: nonEmptyString("The pagination cursor from the previous response."),
      },
      { optional: ["seatFilter", "roleFilter", "limit", "cursor"] },
    ),
    outputSchema: s.object("The response returned when listing CodeRabbit users.", {
      seatsPurchased: s.integer("The total number of seats purchased in the subscription."),
      seatsAssigned: s.integer("The number of seats currently assigned to users."),
      seatAssignmentMode: seatAssignmentModeSchema,
      users: s.array("The CodeRabbit users returned by the API.", userSchema),
      nextCursor: s.nullable(s.string("The cursor for the next page of results.")),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "manage_seats",
    description: "Bulk assign or unassign CodeRabbit seats for up to 500 organization users.",
    inputSchema: s.object(
      "The input payload for managing CodeRabbit seats.",
      {
        action: s.stringEnum(["assign", "unassign"], {
          description: "The seat operation to perform.",
        }),
        userIds: stringArraySchema(
          "The provider user identifiers to assign or unassign seats for.",
          "One provider user identifier.",
          { minItems: 1, maxItems: 500 },
        ),
      },
      { required: ["action", "userIds"] },
    ),
    outputSchema: bulkOperationResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_seat_assignment_mode",
    description: "Retrieve the current CodeRabbit seat assignment mode for a self-hosted Enterprise organization.",
    inputSchema: s.object("The input payload for getting CodeRabbit seat assignment mode.", {}),
    outputSchema: s.object("The response returned with the CodeRabbit seat assignment mode.", {
      mode: seatAssignmentModeSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_seat_assignment_mode",
    description: "Update the CodeRabbit seat assignment mode for a self-hosted Enterprise organization.",
    inputSchema: s.object(
      "The input payload for updating CodeRabbit seat assignment mode.",
      {
        mode: seatAssignmentModeSchema,
      },
      { required: ["mode"] },
    ),
    outputSchema: s.object("The response returned after updating CodeRabbit seat assignment mode.", {
      mode: seatAssignmentModeSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "change_roles",
    description: "Bulk change CodeRabbit organization roles for up to 500 users.",
    inputSchema: s.object(
      "The input payload for changing CodeRabbit user roles.",
      {
        role: userRoleSchema,
        userIds: stringArraySchema(
          "The provider user identifiers to assign the role to.",
          "One provider user identifier.",
          { minItems: 1, maxItems: 500 },
        ),
      },
      { required: ["role", "userIds"] },
    ),
    outputSchema: bulkOperationResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_review_metrics",
    description:
      "Get CodeRabbit merged pull request review metrics for a date range with optional organization, repository, and user filters.",
    inputSchema: s.object(
      "The input payload for getting CodeRabbit review metrics.",
      {
        startDate: s.date("The start date in YYYY-MM-DD format."),
        endDate: s.date("The end date in YYYY-MM-DD format."),
        organizationIds: stringArraySchema(
          "The organization Git provider IDs to filter by, up to 10 values.",
          "One organization Git provider ID.",
          { minItems: 1, maxItems: 10 },
        ),
        repositoryIds: stringArraySchema(
          "The repository Git provider IDs to filter by, up to 10 values.",
          "One repository Git provider ID.",
          { minItems: 1, maxItems: 10 },
        ),
        userIds: stringArraySchema(
          "The author Git provider IDs to filter by, up to 10 values.",
          "One author Git provider ID.",
          { minItems: 1, maxItems: 10 },
        ),
        limit: s.positiveInteger("The maximum number of metric records to return."),
        cursor: nonEmptyString("The pagination cursor for fetching the next page."),
      },
      {
        optional: ["organizationIds", "repositoryIds", "userIds", "limit", "cursor"],
      },
    ),
    outputSchema: s.object("The response returned with CodeRabbit review metrics.", {
      data: s.array("The CodeRabbit review metric records.", reviewMetricSchema),
      nextCursor: s.nullable(s.string("The cursor for fetching the next page of results.")),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_audit_logs",
    description:
      "List CodeRabbit organization audit log entries with optional actor, action, resource type, date, and pagination filters.",
    inputSchema: s.object(
      "The input payload for listing CodeRabbit audit logs.",
      {
        search: s.string({
          description: "Case-insensitive partial match on actor name.",
          maxLength: 200,
        }),
        actions: stringArraySchema(
          "The audit log action keys to filter by, up to 50 values.",
          "One audit log action key.",
          { minItems: 1, maxItems: 50 },
        ),
        resourceTypes: stringArraySchema(
          "The audit log resource type keys to filter by, up to 50 values.",
          "One audit log resource type key.",
          { minItems: 1, maxItems: 50 },
        ),
        dateFrom: s.dateTime("The inclusive lower timestamp bound in ISO 8601 format."),
        dateTo: s.dateTime("The inclusive upper timestamp bound in ISO 8601 format."),
        page: s.integer("The one-based page number.", { minimum: 1 }),
        pageSize: s.integer("The number of results per page.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["search", "actions", "resourceTypes", "dateFrom", "dateTo", "page", "pageSize"] },
    ),
    outputSchema: s.object("The response returned when listing CodeRabbit audit logs.", {
      data: s.array("The audit log entries returned by CodeRabbit.", auditLogEntrySchema),
      pagination: paginationSchema,
      filterOptions: s.looseObject("The available CodeRabbit audit log filter options.", {
        actions: s.array("The available audit log action filters.", filterOptionSchema),
        resource_types: s.array("The available audit log resource type filters.", filterOptionSchema),
      }),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_roles",
    description: "List CodeRabbit built-in and Enterprise custom roles for the organization.",
    inputSchema: s.object(
      "The input payload for listing CodeRabbit roles.",
      {
        orgId: nonEmptyString("The git-provider organization ID for workspace-scoped API tokens."),
        roleType: roleTypeSchema,
        includePermissions: s.boolean("Whether to include permissions for each role."),
        includeUserCount: s.boolean("Whether to include assigned user counts for each role."),
      },
      { optional: ["orgId", "roleType", "includePermissions", "includeUserCount"] },
    ),
    outputSchema: s.object("The response returned when listing CodeRabbit roles.", {
      roles: s.array("The CodeRabbit roles returned by the API.", roleSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_role",
    description: "Get details for one CodeRabbit built-in or Enterprise custom role.",
    inputSchema: s.object(
      "The input payload for getting a CodeRabbit role.",
      {
        roleId: nonEmptyString("The CodeRabbit role identifier."),
        orgId: nonEmptyString("The git-provider organization ID for workspace-scoped API tokens."),
        includePermissions: s.boolean("Whether to include permissions for the role."),
        includeUserCount: s.boolean("Whether to include assigned user count for the role."),
      },
      { optional: ["orgId", "includePermissions", "includeUserCount"] },
    ),
    outputSchema: roleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_role",
    description: "Create a CodeRabbit Enterprise custom role.",
    inputSchema: s.object("The input payload for creating a CodeRabbit custom role.", createRoleFields, {
      optional: ["orgId", "description", "isDefault", "duplicateFrom", "permissions"],
    }),
    outputSchema: roleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_role",
    description: "Update a CodeRabbit Enterprise custom role.",
    inputSchema: s.object("The input payload for updating a CodeRabbit custom role.", updateRoleFields, {
      optional: ["orgId", "name", "description", "isDefault", "permissions"],
    }),
    outputSchema: roleOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_role",
    description: "Delete a CodeRabbit Enterprise custom role when it is not assigned to users.",
    inputSchema: s.object(
      "The input payload for deleting a CodeRabbit custom role.",
      {
        roleId: nonEmptyString("The CodeRabbit role identifier."),
        orgId: nonEmptyString("The git-provider organization ID for workspace-scoped API tokens."),
      },
      { optional: ["orgId"] },
    ),
    outputSchema: s.object("The response returned after deleting a CodeRabbit custom role.", {
      deleted: s.boolean("Whether the CodeRabbit role was deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_role_permissions",
    description: "List valid CodeRabbit role permission resource identifiers and access types for custom roles.",
    inputSchema: s.object(
      "The input payload for listing CodeRabbit role permission options.",
      {
        orgId: nonEmptyString("The git-provider organization ID for workspace-scoped API tokens."),
      },
      { optional: ["orgId"] },
    ),
    outputSchema: s.object("The response returned with CodeRabbit role permission options.", {
      resourceIds: stringArraySchema(
        "The valid CodeRabbit permission resource identifiers.",
        "One permission resource identifier.",
      ),
      accessTypes: s.array("The valid CodeRabbit permission access types.", accessTypeSchema),
      raw: rawSchema,
    }),
  }),
];
