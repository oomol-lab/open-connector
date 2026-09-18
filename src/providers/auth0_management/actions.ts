import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "auth0_management";

const rawObject = s.looseObject({}, { description: "A raw Auth0 Management API object." });
const rawListResponse = s.anyOf(
  [s.array(rawObject, { description: "The raw Auth0 Management API array response." }), rawObject],
  {
    description: "The raw Auth0 Management API list response.",
  },
);
const userId = s.nonEmptyString("The Auth0 user ID, such as auth0|abc123.");
const roleId = s.nonEmptyString("The Auth0 role ID, such as rol_abc123.");
const page = s.integer({ minimum: 0, description: "Zero-based Auth0 page number to request." });
const perPage = s.integer({ minimum: 1, maximum: 100, description: "The number of Auth0 records to return per page." });
const includeTotals = s.boolean({ description: "Whether Auth0 should return a totals wrapper." });
const pagination = { page, perPage, includeTotals };
const permission = s.object(
  {
    permissionName: s.nonEmptyString("The Auth0 permission name, mapped to permission_name."),
    resourceServerIdentifier: s.nonEmptyString(
      "The Auth0 resource server identifier, mapped to resource_server_identifier.",
    ),
  },
  {
    required: ["permissionName", "resourceServerIdentifier"],
    description: "An Auth0 Management API permission reference.",
  },
);

export type Auth0ManagementActionName =
  | "list_users"
  | "search_users_by_email"
  | "get_user"
  | "list_roles"
  | "get_role"
  | "list_user_roles"
  | "list_user_permissions"
  | "list_user_effective_permissions"
  | "list_user_effective_roles"
  | "assign_roles_to_user"
  | "remove_roles_from_user"
  | "list_role_permissions"
  | "add_permissions_to_role"
  | "remove_permissions_from_role"
  | "list_role_users";

export const auth0ManagementActions: ActionDefinition[] = [
  action(
    "list_users",
    "read",
    "List Auth0 users with pagination and optional Lucene search query.",
    {
      ...pagination,
      query: s.nonEmptyString("Auth0 user search query in Lucene syntax."),
    },
    [],
    usersOutput(),
    ["read:users"],
  ),
  action(
    "search_users_by_email",
    "read",
    "Search Auth0 users by email with the official users-by-email endpoint.",
    { email: s.email("The email address to search for.") },
    ["email"],
    usersOutput(),
    ["read:users"],
  ),
  action(
    "get_user",
    "read",
    "Retrieve one Auth0 user by user ID.",
    { userId },
    ["userId"],
    s.actionOutput({ user: rawObject }, "Auth0 user details."),
    ["read:users"],
  ),
  action(
    "list_roles",
    "read",
    "List Auth0 roles with pagination and optional name filter.",
    {
      ...pagination,
      nameFilter: s.nonEmptyString("A role name filter passed to Auth0 as name_filter."),
    },
    [],
    rolesOutput(),
    ["read:roles"],
  ),
  action(
    "get_role",
    "read",
    "Retrieve one Auth0 role by role ID.",
    { roleId },
    ["roleId"],
    s.actionOutput({ role: rawObject }, "Auth0 role details."),
    ["read:roles"],
  ),
  action(
    "list_user_roles",
    "read",
    "List Auth0 roles assigned to a user.",
    { userId, ...pagination },
    ["userId"],
    rolesOutput(),
    ["read:users", "read:roles", "read:role_members"],
  ),
  action(
    "list_user_permissions",
    "read",
    "List permissions directly assigned to an Auth0 user.",
    { userId, ...pagination },
    ["userId"],
    permissionsOutput(),
    ["read:users"],
  ),
  action(
    "list_user_effective_permissions",
    "read",
    "List Auth0 permissions granted to a user directly or through roles or groups.",
    { userId, ...pagination },
    ["userId"],
    permissionsOutput(),
    ["read:user_effective_permissions"],
  ),
  action(
    "list_user_effective_roles",
    "read",
    "List Auth0 roles granted to a user directly or through group membership.",
    { userId, ...pagination },
    ["userId"],
    rolesOutput(),
    ["read:user_effective_roles"],
  ),
  action(
    "assign_roles_to_user",
    "write",
    "Assign one or more Auth0 roles to a user.",
    roleIdsInput(),
    ["userId", "roleIds"],
    successOutput(),
    ["update:users", "create:role_members"],
  ),
  action(
    "remove_roles_from_user",
    "destructive",
    "Remove one or more Auth0 roles from a user.",
    roleIdsInput(),
    ["userId", "roleIds"],
    successOutput(),
    ["update:users", "delete:role_members"],
  ),
  action(
    "list_role_permissions",
    "read",
    "List permissions granted by an Auth0 role.",
    { roleId, ...pagination },
    ["roleId"],
    permissionsOutput(),
    ["read:roles"],
  ),
  action(
    "add_permissions_to_role",
    "write",
    "Associate one or more Auth0 permissions with a role.",
    rolePermissionsInput(),
    ["roleId", "permissions"],
    successOutput(),
    ["update:roles"],
  ),
  action(
    "remove_permissions_from_role",
    "destructive",
    "Remove one or more Auth0 permissions from a role.",
    rolePermissionsInput(),
    ["roleId", "permissions"],
    successOutput(),
    ["update:roles"],
  ),
  action(
    "list_role_users",
    "read",
    "List users assigned to an Auth0 role with offset or checkpoint pagination.",
    {
      roleId,
      ...pagination,
      from: s.nonEmptyString("Auth0 checkpoint pagination cursor."),
      take: s.integer({
        minimum: 1,
        maximum: 100,
        description: "The number of Auth0 users to retrieve with checkpoint pagination.",
      }),
    },
    ["roleId"],
    usersOutput(),
    ["read:roles", "read:users", "read:role_members"],
  ),
];

function action(
  name: Auth0ManagementActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  input: Record<string, JsonSchema>,
  required: string[],
  output: JsonSchema,
  providerPermissions: string[],
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    providerPermissions,
    inputSchema: s.actionInput(input, required, "The input payload for this action."),
    outputSchema: output,
  });
}

function usersOutput(): JsonSchema {
  return s.actionOutput(
    {
      users: s.array(rawObject, { description: "Auth0 users returned by the Management API." }),
      raw: rawListResponse,
    },
    "List of Auth0 users.",
  );
}

function rolesOutput(): JsonSchema {
  return s.actionOutput(
    {
      roles: s.array(rawObject, { description: "Auth0 roles returned by the Management API." }),
      raw: rawListResponse,
    },
    "List of Auth0 roles.",
  );
}

function permissionsOutput(): JsonSchema {
  return s.actionOutput(
    {
      permissions: s.array(rawObject, { description: "Auth0 permissions returned by the Management API." }),
      raw: rawListResponse,
    },
    "List of Auth0 permissions.",
  );
}

function successOutput(): JsonSchema {
  return s.actionOutput(
    {
      success: s.boolean({ description: "Whether the Auth0 role update request completed successfully." }),
    },
    "Auth0 role update result.",
  );
}

function roleIdsInput(): Record<string, JsonSchema> {
  return {
    userId,
    roleIds: s.array(roleId, { minItems: 1, description: "Auth0 role IDs to assign or remove." }),
  };
}

function rolePermissionsInput(): Record<string, JsonSchema> {
  return {
    roleId,
    permissions: s.array(permission, {
      minItems: 1,
      description: "Auth0 permissions to associate with or remove from the role.",
    }),
  };
}
