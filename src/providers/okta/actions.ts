import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "okta";

const afterCursor = s.string({
  description: "The opaque Okta pagination cursor from a previous response.",
  minLength: 1,
  pattern: "\\S",
});
const sortOrder = s.stringEnum(["asc", "desc"], {
  description: "The sort direction for an Okta search query.",
  default: "asc",
});
const userId = s.string({
  description: "The Okta user ID, login, or login shortname accepted by the Users API.",
  minLength: 1,
  pattern: "\\S",
});
const groupId = s.string({ description: "The Okta group ID.", minLength: 1, pattern: "\\S" });
const rawObject = (description: string) => s.looseObject(description);

const userSchema = s.object("A normalized Okta user.", {
  id: s.string("The Okta user ID."),
  status: s.nullableString("The Okta user status, such as ACTIVE or SUSPENDED."),
  created: s.nullableString("When Okta created the user."),
  activated: s.nullableString("When Okta activated the user."),
  statusChanged: s.nullableString("When the user status last changed."),
  lastLogin: s.nullableString("When the user last signed in."),
  lastUpdated: s.nullableString("When the user was last updated."),
  passwordChanged: s.nullableString("When the user password last changed."),
  profile: rawObject("The Okta user profile, including custom attributes."),
  raw: rawObject("The raw Okta user object."),
});

const groupSchema = s.object("A normalized Okta group.", {
  id: s.string("The Okta group ID."),
  type: s.nullableString("The Okta group type, such as OKTA_GROUP."),
  created: s.nullableString("When Okta created the group."),
  lastUpdated: s.nullableString("When the group was last updated."),
  lastMembershipUpdated: s.nullableString("When the group membership last changed."),
  objectClass: s.stringArray("The Okta group object classes.", { itemDescription: "One object class value." }),
  profile: rawObject("The Okta group profile."),
  raw: rawObject("The raw Okta group object."),
});

const usersPageSchema = s.object("A page of Okta users.", {
  users: s.array("The returned Okta users.", userSchema),
  nextAfter: s.nullableString("The next Okta after cursor, or null for the final page."),
  raw: s.array("The raw Okta user objects.", rawObject("One raw Okta user object.")),
});

const groupsPageSchema = s.object("A page of Okta groups.", {
  groups: s.array("The returned Okta groups.", groupSchema),
  nextAfter: s.nullableString("The next Okta after cursor, or null for the final page."),
  raw: s.array("The raw Okta group objects.", rawObject("One raw Okta group object.")),
});

const userOutputSchema = s.object("The normalized Okta user response.", {
  user: userSchema,
  raw: rawObject("The raw Okta user object."),
});

const groupOutputSchema = s.object("The normalized Okta group response.", {
  group: groupSchema,
  raw: rawObject("The raw Okta group object."),
});

const userProfile = rawObject("Okta user profile fields, including required attributes and custom profile properties.");
const userCredentials = rawObject(
  "Okta user credentials, such as password, recovery question, or authentication provider fields.",
);
const groupProfile = s.looseRequiredObject(
  "The Okta group profile.",
  {
    name: s.string({ description: "The Okta group name.", minLength: 1, pattern: "\\S" }),
    description: s.string("The Okta group description."),
  },
  { optional: ["description"] },
);

export type OktaActionName =
  | "list_users"
  | "get_user"
  | "create_user"
  | "update_user"
  | "delete_user"
  | "lifecycle_user"
  | "list_groups"
  | "get_group"
  | "create_group"
  | "update_group"
  | "delete_group"
  | "list_group_users"
  | "add_user_to_group"
  | "remove_user_from_group";

export const oktaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List Okta users with search, filtering, sorting, field projection, and cursor pagination.",
    requiredScopes: ["okta.users.read"],
    inputSchema: s.object(
      "Options for listing Okta users.",
      {
        limit: s.integer("The maximum number of users to return.", { minimum: 1, maximum: 200, default: 200 }),
        after: afterCursor,
        search: s.string({ description: "An Okta Users API search expression.", minLength: 1, pattern: "\\S" }),
        filter: s.string({ description: "An Okta Users API filter expression.", minLength: 1, pattern: "\\S" }),
        q: s.string({
          description: "A simple prefix query for user first name, last name, or email.",
          minLength: 1,
          pattern: "\\S",
        }),
        sortBy: s.string({
          description: "The user property used to sort search results.",
          minLength: 1,
          pattern: "\\S",
        }),
        sortOrder,
        fields: s.string({
          description: "A comma-separated projection of user properties to return.",
          minLength: 1,
          pattern: "\\S",
        }),
      },
      { optional: ["limit", "after", "search", "filter", "q", "sortBy", "sortOrder", "fields"] },
    ),
    outputSchema: usersPageSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Okta user by ID, login, or login shortname.",
    requiredScopes: ["okta.users.read"],
    inputSchema: s.object("The user to retrieve.", { userId }),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_user",
    description: "Create an Okta user with profile, credentials, group assignments, and activation options.",
    requiredScopes: ["okta.users.manage"],
    inputSchema: s.object(
      "The Okta user creation request.",
      {
        profile: userProfile,
        credentials: userCredentials,
        groupIds: s.array("Okta group IDs assigned during creation.", groupId),
        activate: s.boolean({ description: "Whether Okta should activate the user after creation.", default: true }),
        provider: s.boolean({
          description: "Whether the credentials specify an authentication provider for the user.",
          default: false,
        }),
        nextLogin: s.stringEnum("The password behavior for the user's next login.", ["changePassword"]),
      },
      { optional: ["credentials", "groupIds", "activate", "provider", "nextLogin"] },
    ),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    description: "Partially update an Okta user's profile or credentials.",
    requiredScopes: ["okta.users.manage"],
    inputSchema: s.object(
      "The Okta user partial update request.",
      {
        userId,
        profile: userProfile,
        credentials: userCredentials,
        strict: s.boolean("Whether Okta should enforce password age and history policies."),
      },
      { optional: ["profile", "credentials", "strict"] },
    ),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    description: "Deactivate an active Okta user, or permanently delete a user that is already deactivated.",
    requiredScopes: ["okta.users.manage"],
    inputSchema: s.object(
      "The Okta user deletion request.",
      {
        userId,
        sendEmail: s.boolean("Whether Okta should send a deactivation email to the admin."),
      },
      { optional: ["sendEmail"] },
    ),
    outputSchema: s.object("The result of the Okta user deletion request.", {
      userId: s.string("The requested Okta user ID or login."),
      result: s.stringEnum("Whether the request deactivated or permanently deleted the user.", [
        "deactivated",
        "deleted",
      ]),
      deleted: s.boolean("Whether the user was permanently deleted."),
    }),
  }),
  defineProviderAction(service, {
    name: "lifecycle_user",
    description: "Activate, reactivate, deactivate, suspend, unsuspend, unlock, or expire an Okta user's password.",
    requiredScopes: ["okta.users.manage"],
    inputSchema: s.object(
      "The Okta user lifecycle request.",
      {
        userId,
        operation: s.stringEnum("The lifecycle operation to perform.", [
          "activate",
          "reactivate",
          "deactivate",
          "suspend",
          "unsuspend",
          "unlock",
          "expire_password",
        ]),
        sendEmail: s.boolean("Whether supported activation or deactivation operations should send email."),
        tempPassword: s.boolean(
          "For expire_password, whether Okta should expire the password and return a temporary password.",
        ),
        revokeSessions: s.boolean(
          "When returning a temporary password, whether Okta should revoke the user's existing sessions.",
        ),
      },
      { optional: ["sendEmail", "tempPassword", "revokeSessions"] },
    ),
    outputSchema: s.object("The Okta user lifecycle response.", {
      userId: s.string("The requested Okta user ID or login."),
      operation: s.string("The completed lifecycle operation."),
      result: s.nullable(rawObject("The Okta lifecycle response body, or null for an empty response.")),
      raw: s.nullable(rawObject("The raw Okta lifecycle response body, or null for an empty response.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Okta groups with search, filtering, sorting, expansion, and cursor pagination.",
    requiredScopes: ["okta.groups.read"],
    inputSchema: s.object(
      "Options for listing Okta groups.",
      {
        limit: s.integer("The maximum number of groups to return.", { minimum: 1, maximum: 10_000 }),
        after: afterCursor,
        search: s.string({ description: "An Okta Groups API search expression.", minLength: 1, pattern: "\\S" }),
        filter: s.string({ description: "An Okta Groups API filter expression.", minLength: 1, pattern: "\\S" }),
        q: s.string({
          description: "A simple query that matches the Okta group name.",
          minLength: 1,
          pattern: "\\S",
        }),
        expand: s.stringEnum("Additional group metadata to include.", ["stats", "app"]),
        sortBy: s.string({
          description: "The group property used to sort search results.",
          minLength: 1,
          pattern: "\\S",
        }),
        sortOrder,
      },
      { optional: ["limit", "after", "search", "filter", "q", "expand", "sortBy", "sortOrder"] },
    ),
    outputSchema: groupsPageSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Okta group by ID.",
    requiredScopes: ["okta.groups.read"],
    inputSchema: s.object("The group to retrieve.", { groupId }),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create an Okta-managed group.",
    requiredScopes: ["okta.groups.manage"],
    inputSchema: s.object("The Okta group creation request.", { profile: groupProfile }),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Replace an Okta-managed group's profile.",
    requiredScopes: ["okta.groups.manage"],
    inputSchema: s.object("The Okta group replacement request.", { groupId, profile: groupProfile }),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Delete an Okta-managed group by ID.",
    requiredScopes: ["okta.groups.manage"],
    inputSchema: s.object("The group to delete.", { groupId }),
    outputSchema: s.object("The Okta group deletion result.", {
      groupId: s.string("The deleted Okta group ID."),
      deleted: s.boolean("Whether Okta accepted the group deletion."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_group_users",
    description: "List the users that are members of an Okta group.",
    requiredScopes: ["okta.groups.read"],
    inputSchema: s.object(
      "Options for listing Okta group members.",
      {
        groupId,
        limit: s.positiveInteger("The maximum number of group members to return.", { default: 1000 }),
        after: afterCursor,
      },
      { optional: ["limit", "after"] },
    ),
    outputSchema: usersPageSchema,
  }),
  defineProviderAction(service, {
    name: "add_user_to_group",
    description: "Assign an Okta user to an Okta-managed group.",
    requiredScopes: ["okta.groups.manage"],
    inputSchema: s.object("The Okta group membership to create.", { groupId, userId }),
    outputSchema: s.object("The Okta group membership assignment result.", {
      groupId: s.string("The Okta group ID."),
      userId: s.string("The Okta user ID."),
      added: s.boolean("Whether Okta accepted the membership assignment."),
    }),
  }),
  defineProviderAction(service, {
    name: "remove_user_from_group",
    description: "Unassign an Okta user from an Okta-managed group.",
    requiredScopes: ["okta.groups.manage"],
    inputSchema: s.object("The Okta group membership to remove.", { groupId, userId }),
    outputSchema: s.object("The Okta group membership removal result.", {
      groupId: s.string("The Okta group ID."),
      userId: s.string("The Okta user ID."),
      removed: s.boolean("Whether Okta accepted the membership removal."),
    }),
  }),
];
