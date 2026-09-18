import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  additionalFiltersInputField,
  deletedOutputSchema,
  emptyInputSchema,
  groupSchema,
  idArrayField,
  idField,
  pageInputFields,
  paginatedOutputSchema,
  userSchema,
} from "./schemas.ts";

const service = "paperless_ngx";

const permissionCodenameDescription =
  "A Django permission codename without the app label, for example view_document or change_tag.";

const passwordInputDescription =
  "Plain-text password, checked by the instance password validators. Paperless-ngx never returns it; get_user shows an obfuscated placeholder made of asterisks instead. An empty value or a value made only of asterisks leaves the current password unchanged.";

const userFilterInputFields = {
  username__istartswith: s.string("Case-insensitive username prefix."),
  username__iendswith: s.string("Case-insensitive username suffix."),
  username__icontains: s.string("Case-insensitive username substring."),
  username__iexact: s.string("Case-insensitive exact username."),
};

const groupFilterInputFields = {
  name__istartswith: s.string("Case-insensitive group name prefix."),
  name__iendswith: s.string("Case-insensitive group name suffix."),
  name__icontains: s.string("Case-insensitive group name substring."),
  name__iexact: s.string("Case-insensitive exact group name."),
};

const userWriteInputFields = {
  username: s.nonEmptyString("Unique username of at most 150 characters: letters, digits and @ . + - _ only.", {
    maxLength: 150,
  }),
  email: s.string("Email address; may be empty."),
  password: s.string(passwordInputDescription),
  first_name: s.string("First name; may be empty.", { maxLength: 150 }),
  last_name: s.string("Last name; may be empty.", { maxLength: 150 }),
  is_staff: s.boolean(
    "Whether the user may access the Django admin site and see every task. Only a superuser may grant or change it; other callers get 403.",
  ),
  is_active: s.boolean("Whether the account may log in and use its API token. Defaults to true on create."),
  is_superuser: s.boolean(
    "Whether the user has every permission. Only a superuser may grant or change it, and only superusers may modify or delete other superusers.",
  ),
  groups: idArrayField("Ids of the groups the user belongs to. Replaces the whole list.", "A group id."),
  user_permissions: s.array(
    "Permission codenames granted directly to the user, for example view_document. Replaces the whole list.",
    s.nonEmptyString(permissionCodenameDescription),
  ),
};

const groupWriteInputFields = {
  name: s.nonEmptyString("Unique group name of at most 150 characters.", { maxLength: 150 }),
  permissions: s.array(
    "Permission codenames granted to every member, for example view_document. Replaces the whole list.",
    s.nonEmptyString(permissionCodenameDescription),
  ),
};

const userOutputSchema = s.requiredObject("The user.", { user: userSchema });

const groupOutputSchema = s.requiredObject("The group.", { group: groupSchema });

const profileSchema = s.looseObject("The profile of the user that owns the API token.", {
  email: s.string("Email address; may be empty."),
  password: s.string("Obfuscated placeholder; the real password is never returned."),
  first_name: s.string("First name; may be empty."),
  last_name: s.string("Last name; may be empty."),
  auth_token: s.string(
    "The API token of the connected user, that is the credential this connection uses. Redacted from logs.",
  ),
  social_accounts: s.array(
    "Social login accounts linked to the user.",
    s.looseObject("A linked social account.", {
      id: s.integer("The social account id."),
      provider: s.string("The social login provider id."),
      name: s.string("Display name of the account at the provider, or Unknown App."),
    }),
  ),
  has_usable_password: s.boolean("Whether the user can log in with a password (false for social-login-only accounts)."),
  is_mfa_enabled: s.boolean("Whether TOTP multi-factor authentication is active."),
});

const profileWriteInputFields = {
  email: s.string("New email address; an empty string clears it."),
  password: s.string(passwordInputDescription),
  first_name: s.string("New first name; may be empty.", { maxLength: 150 }),
  last_name: s.string("New last name; may be empty.", { maxLength: 150 }),
};

export const paperlessNgxUserActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description:
      "List Paperless-ngx user accounts with pagination and username filters, ordered by username. The built-in consumer and AnonymousUser accounts are never listed. Requires the view_user permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination and username filters.",
      {
        page: pageInputFields.page,
        page_size: pageInputFields.page_size,
        ordering: s.nonEmptyString(
          "Field to order by, prefixed with - for descending order. Only username is accepted; defaults to username.",
        ),
        ...userFilterInputFields,
        additional_filters: additionalFiltersInputField,
      },
      {
        optional: ["page", "page_size", "ordering", ...Object.keys(userFilterInputFields), "additional_filters"],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of users.", userSchema),
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description:
      "Get one Paperless-ngx user account by id, including group memberships, direct and inherited permission codenames and whether MFA is enabled. Requires the view_user permission.",
    requiredScopes: [],
    inputSchema: s.object("The user to read.", { id: idField("The user id.") }),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_user",
    operationType: "write",
    description:
      "Create a Paperless-ngx user account. Only username is required; without a password the account cannot log in with a password until one is set. Granting is_staff or is_superuser requires the caller to be a superuser. Requires the add_user permission.",
    requiredScopes: [],
    inputSchema: s.object("The user to create.", userWriteInputFields, {
      optional: Object.keys(userWriteInputFields).filter((field) => field !== "username"),
    }),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user",
    operationType: "write",
    description:
      "Partially update a Paperless-ngx user account; only the provided fields change and groups or user_permissions replace the whole list. Changing is_staff or is_superuser, or modifying a superuser at all, requires the caller to be a superuser. Requires the change_user permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The user fields to update.",
      { id: idField("Id of the user to update."), ...userWriteInputFields },
      { optional: Object.keys(userWriteInputFields) },
    ),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_user",
    operationType: "destructive",
    description:
      "Permanently delete a Paperless-ngx user account. Objects owned by the user become unowned. Deleting a superuser requires the caller to be a superuser. Requires the delete_user permission.",
    requiredScopes: [],
    inputSchema: s.object("The user to delete.", { id: idField("Id of the user to delete.") }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted user."),
  }),
  defineProviderAction(service, {
    name: "deactivate_user_totp",
    operationType: "destructive",
    description:
      "Remove the TOTP multi-factor authenticator of a user so they can log in with a password only. Callers may deactivate their own TOTP; deactivating another user's requires the caller to be a superuser. Fails with 404 when the user has no TOTP authenticator.",
    requiredScopes: [],
    inputSchema: s.object("The user whose TOTP to deactivate.", {
      id: idField("Id of the user."),
    }),
    outputSchema: s.requiredObject("The deactivation result.", {
      deactivated: s.boolean("Whether Paperless-ngx removed the TOTP authenticator."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description:
      "List Paperless-ngx user groups with pagination and name filters, ordered by name. Requires the view_group permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination and name filters.",
      {
        page: pageInputFields.page,
        page_size: pageInputFields.page_size,
        ordering: s.nonEmptyString(
          "Field to order by, prefixed with - for descending order. Only name is accepted; defaults to name.",
        ),
        ...groupFilterInputFields,
        additional_filters: additionalFiltersInputField,
      },
      {
        optional: ["page", "page_size", "ordering", ...Object.keys(groupFilterInputFields), "additional_filters"],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of groups.", groupSchema),
  }),
  defineProviderAction(service, {
    name: "get_group",
    operationType: "read",
    description:
      "Get one Paperless-ngx user group by id with its permission codenames. Requires the view_group permission.",
    requiredScopes: [],
    inputSchema: s.object("The group to read.", { id: idField("The group id.") }),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_group",
    operationType: "write",
    description:
      "Create a Paperless-ngx user group. Paperless-ngx requires the permissions list on create, so it is sent as an empty list when omitted. Requires the add_group permission.",
    requiredScopes: [],
    inputSchema: s.object("The group to create.", groupWriteInputFields, {
      optional: ["permissions"],
    }),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_group",
    operationType: "write",
    description:
      "Partially update a Paperless-ngx user group; only the provided fields change and permissions replaces the whole list. Requires the change_group permission.",
    requiredScopes: [],
    inputSchema: s.object(
      "The group fields to update.",
      { id: idField("Id of the group to update."), ...groupWriteInputFields },
      { optional: Object.keys(groupWriteInputFields) },
    ),
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_group",
    operationType: "destructive",
    description:
      "Permanently delete a Paperless-ngx user group. Members lose the permissions inherited from it. Requires the delete_group permission.",
    requiredScopes: [],
    inputSchema: s.object("The group to delete.", { id: idField("Id of the group to delete.") }),
    outputSchema: deletedOutputSchema("The deletion result.", "id", "Id of the deleted group."),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    operationType: "read",
    description:
      "Get the profile of the user that owns the API token: name, email, linked social accounts, whether a password and MFA are set, and the API token itself (redacted from logs).",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: profileSchema,
  }),
  defineProviderAction(service, {
    name: "update_profile",
    operationType: "write",
    description:
      "Update the name, email or password of the user that owns the API token. Only the provided fields change; a password made only of asterisks is ignored. Returns the updated profile including the API token (redacted from logs).",
    requiredScopes: [],
    inputSchema: s.object("The profile fields to update.", profileWriteInputFields, {
      optional: Object.keys(profileWriteInputFields),
    }),
    outputSchema: profileSchema,
  }),
];
