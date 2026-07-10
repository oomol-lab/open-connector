import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "okta";

const trimmedString = (description: string) => s.string({ description, minLength: 1, pattern: "\\S" });

const listLimit = s.integer({
  description: "The maximum number of records to return. Okta supports values from 1 through 200.",
  minimum: 1,
  maximum: 200,
  default: 100,
});

const afterCursor = trimmedString("The Okta pagination cursor from a previous response.");

const oktaRawObject = (description: string) => s.looseObject(description);

const oktaUserSchema = s.object("One normalized Okta user.", {
  id: s.string("The Okta user ID."),
  status: s.nullableString("The Okta user status, such as ACTIVE or SUSPENDED."),
  created: s.nullableString("When Okta created the user."),
  activated: s.nullableString("When Okta activated the user, if returned."),
  statusChanged: s.nullableString("When the user's status last changed, if returned."),
  lastLogin: s.nullableString("When the user last signed in, if returned."),
  lastUpdated: s.nullableString("When the user was last updated, if returned."),
  passwordChanged: s.nullableString("When the user's password last changed, if returned."),
  profile: oktaRawObject("The Okta user profile object."),
  raw: oktaRawObject("The raw Okta user object."),
});

const oktaGroupSchema = s.object("One normalized Okta group.", {
  id: s.string("The Okta group ID."),
  type: s.nullableString("The Okta group type, such as OKTA_GROUP."),
  created: s.nullableString("When Okta created the group."),
  lastUpdated: s.nullableString("When the group was last updated, if returned."),
  lastMembershipUpdated: s.nullableString("When group membership last changed, if returned."),
  objectClass: s.array("The Okta group object classes.", s.string("One object class value.")),
  profile: oktaRawObject("The Okta group profile object."),
  raw: oktaRawObject("The raw Okta group object."),
});

const usersPageSchema = s.object("A page of Okta users.", {
  users: s.array("The returned Okta users.", oktaUserSchema),
  nextAfter: s.nullableString("The next Okta `after` cursor, or null when there is no next page."),
  raw: s.array("The raw Okta user objects.", oktaRawObject("One raw Okta user object.")),
});

const groupsPageSchema = s.object("A page of Okta groups.", {
  groups: s.array("The returned Okta groups.", oktaGroupSchema),
  nextAfter: s.nullableString("The next Okta `after` cursor, or null when there is no next page."),
  raw: s.array("The raw Okta group objects.", oktaRawObject("One raw Okta group object.")),
});

const userIdInput = {
  userId: trimmedString("The Okta user ID, login, or login shortname accepted by the Users API."),
};

const groupIdInput = {
  groupId: trimmedString("The Okta group ID."),
};

const userWriteBody = {
  profile: oktaRawObject(
    "Okta user profile fields. Include required profile attributes such as login, email, firstName, and lastName when creating a user.",
  ),
  credentials: oktaRawObject("Optional Okta user credentials object, such as password or recovery question fields."),
};

const userOutputSchema = s.object("The normalized Okta user response.", {
  user: oktaUserSchema,
  raw: oktaRawObject("The raw Okta user object."),
});

const groupOutputSchema = s.object("The normalized Okta group response.", {
  group: oktaGroupSchema,
  raw: oktaRawObject("The raw Okta group object."),
});

const listUsersAction = defineProviderAction(service, {
  name: "list_users",
  description: "List Okta users with optional search, filter, and pagination controls.",
  inputSchema: s.object(
    "The input payload for listing Okta users.",
    {
      limit: listLimit,
      after: afterCursor,
      search: trimmedString('An Okta Users API search expression, such as `profile.email eq "a@example.com"`.'),
      filter: trimmedString("An Okta Users API filter expression."),
      q: trimmedString("A query string for matching user login, first name, last name, or email."),
    },
    { optional: ["limit", "after", "search", "filter", "q"] },
  ),
  outputSchema: usersPageSchema,
});

const getUserAction = defineProviderAction(service, {
  name: "get_user",
  description: "Get one Okta user by ID, login, or login shortname.",
  inputSchema: s.object("The input payload for getting an Okta user.", userIdInput, { required: ["userId"] }),
  outputSchema: userOutputSchema,
});

const createUserAction = defineProviderAction(service, {
  name: "create_user",
  description: "Create an Okta user with profile fields, optional credentials, and optional initial groups.",
  inputSchema: s.object(
    "The input payload for creating an Okta user.",
    {
      ...userWriteBody,
      groupIds: s.stringArray("Okta group IDs to assign during user creation."),
      activate: s.boolean({
        description: "Whether Okta should activate the user after creation.",
        default: true,
      }),
    },
    { required: ["profile"], optional: ["credentials", "groupIds", "activate"] },
  ),
  outputSchema: userOutputSchema,
});

const updateUserAction = defineProviderAction(service, {
  name: "update_user",
  description: "Update an Okta user's profile and optional credential fields.",
  inputSchema: s.object(
    "The input payload for updating an Okta user.",
    {
      ...userIdInput,
      ...userWriteBody,
    },
    { required: ["userId"], optional: ["profile", "credentials"] },
  ),
  outputSchema: userOutputSchema,
});

const deleteUserAction = defineProviderAction(service, {
  name: "delete_user",
  description: "Delete an Okta user. Okta may require the user to be deactivated before permanent deletion.",
  inputSchema: s.object(
    "The input payload for deleting an Okta user.",
    {
      ...userIdInput,
      sendEmail: s.boolean("Whether Okta should send a deactivation email when applicable."),
    },
    { optional: ["sendEmail"] },
  ),
  outputSchema: s.object("The normalized Okta delete user response.", {
    userId: s.string("The Okta user ID or login passed to the action."),
    deleted: s.boolean("Whether the delete request completed successfully."),
  }),
});

const lifecycleOperationSchema = s.stringEnum("The Okta user lifecycle operation to perform.", [
  "activate",
  "reactivate",
  "deactivate",
  "suspend",
  "unsuspend",
  "unlock",
  "expire_password",
]);

const lifecycleUserAction = defineProviderAction(service, {
  name: "lifecycle_user",
  description:
    "Run a supported Okta user lifecycle operation: activate, reactivate, deactivate, suspend, unsuspend, unlock, or expire password.",
  inputSchema: s.object(
    "The input payload for an Okta user lifecycle operation.",
    {
      ...userIdInput,
      operation: lifecycleOperationSchema,
      sendEmail: s.boolean(
        "Whether Okta should send email for lifecycle operations that support it, such as activate or deactivate.",
      ),
      tempPassword: s.boolean(
        "For expire_password, whether Okta should return a temporary password when the org policy allows it.",
      ),
    },
    { required: ["userId", "operation"], optional: ["sendEmail", "tempPassword"] },
  ),
  outputSchema: s.object("The normalized Okta lifecycle response.", {
    userId: s.string("The Okta user ID or login passed to the action."),
    operation: lifecycleOperationSchema,
    result: s.nullable(oktaRawObject("The Okta lifecycle response body, or null for empty responses.")),
    raw: s.nullable(oktaRawObject("The raw Okta lifecycle response body, or null for empty responses.")),
  }),
});

const listGroupsAction = defineProviderAction(service, {
  name: "list_groups",
  description: "List Okta groups with optional query, search, filter, and pagination controls.",
  inputSchema: s.object(
    "The input payload for listing Okta groups.",
    {
      limit: listLimit,
      after: afterCursor,
      search: trimmedString("An Okta Groups API search expression."),
      filter: trimmedString("An Okta Groups API filter expression."),
      q: trimmedString("A query string for matching group names."),
    },
    { optional: ["limit", "after", "search", "filter", "q"] },
  ),
  outputSchema: groupsPageSchema,
});

const getGroupAction = defineProviderAction(service, {
  name: "get_group",
  description: "Get one Okta group by ID.",
  inputSchema: s.object("The input payload for getting an Okta group.", groupIdInput, { required: ["groupId"] }),
  outputSchema: groupOutputSchema,
});

const groupProfileSchema = s.object(
  "The Okta group profile fields.",
  {
    name: trimmedString("The Okta group name."),
    description: s.string("The Okta group description."),
  },
  { optional: ["description"] },
);

const createGroupAction = defineProviderAction(service, {
  name: "create_group",
  description: "Create an Okta group with a profile name and optional description.",
  inputSchema: s.object(
    "The input payload for creating an Okta group.",
    {
      profile: groupProfileSchema,
    },
    { required: ["profile"] },
  ),
  outputSchema: groupOutputSchema,
});

const updateGroupAction = defineProviderAction(service, {
  name: "update_group",
  description: "Replace an Okta group's profile name and optional description.",
  inputSchema: s.object(
    "The input payload for updating an Okta group.",
    {
      ...groupIdInput,
      profile: groupProfileSchema,
    },
    { required: ["groupId", "profile"] },
  ),
  outputSchema: groupOutputSchema,
});

const deleteGroupAction = defineProviderAction(service, {
  name: "delete_group",
  description: "Delete an Okta group by ID.",
  inputSchema: s.object("The input payload for deleting an Okta group.", groupIdInput, { required: ["groupId"] }),
  outputSchema: s.object("The normalized Okta delete group response.", {
    groupId: s.string("The Okta group ID passed to the action."),
    deleted: s.boolean("Whether the delete request completed successfully."),
  }),
});

const listGroupUsersAction = defineProviderAction(service, {
  name: "list_group_users",
  description: "List users that are members of an Okta group.",
  inputSchema: s.object(
    "The input payload for listing Okta group members.",
    {
      ...groupIdInput,
      limit: listLimit,
      after: afterCursor,
    },
    { required: ["groupId"], optional: ["limit", "after"] },
  ),
  outputSchema: usersPageSchema,
});

const addUserToGroupAction = defineProviderAction(service, {
  name: "add_user_to_group",
  description: "Add an Okta user to an Okta group.",
  inputSchema: s.object(
    "The input payload for adding an Okta user to a group.",
    {
      ...groupIdInput,
      ...userIdInput,
    },
    { required: ["groupId", "userId"] },
  ),
  outputSchema: s.object("The normalized Okta add group member response.", {
    groupId: s.string("The Okta group ID passed to the action."),
    userId: s.string("The Okta user ID passed to the action."),
    added: s.boolean("Whether the membership request completed successfully."),
  }),
});

const removeUserFromGroupAction = defineProviderAction(service, {
  name: "remove_user_from_group",
  description: "Remove an Okta user from an Okta group.",
  inputSchema: s.object(
    "The input payload for removing an Okta user from a group.",
    {
      ...groupIdInput,
      ...userIdInput,
    },
    { required: ["groupId", "userId"] },
  ),
  outputSchema: s.object("The normalized Okta remove group member response.", {
    groupId: s.string("The Okta group ID passed to the action."),
    userId: s.string("The Okta user ID passed to the action."),
    removed: s.boolean("Whether the membership removal request completed successfully."),
  }),
});

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

export const oktaActions: ProviderActionDefinition<OktaActionName>[] = [
  listUsersAction,
  getUserAction,
  createUserAction,
  updateUserAction,
  deleteUserAction,
  lifecycleUserAction,
  listGroupsAction,
  getGroupAction,
  createGroupAction,
  updateGroupAction,
  deleteGroupAction,
  listGroupUsersAction,
  addUserToGroupAction,
  removeUserFromGroupAction,
];
