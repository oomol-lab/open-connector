import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { roamScimUserRoleExtensionUrn } from "./constants.ts";

const service = "roam_scim";

const scimIdSchema = s.nonEmptyString("The Roam SCIM resource ID.");
const userEmailSchema = s.email(
  "The user's primary email address. Roam uses this as both userName and emails[0].value.",
);
const givenNameSchema = s.nonEmptyString("The user's SCIM name.givenName value.");
const familyNameSchema = s.nonEmptyString("The user's SCIM name.familyName value.");
const externalIdInputSchema = s.nonEmptyString(
  "The optional external identifier used to correlate this user with an identity provider.",
);
const activeInputSchema = s.boolean("Whether the Roam user should be active. Set false to archive access.");
const roleSchema = s.stringEnum(["User", "Admin"], {
  description: "The Roam Administration role assigned through the SCIM extension.",
});
const startIndexSchema = s.positiveInteger("The one-based SCIM startIndex pagination value.");
const countSchema = s.nonNegativeInteger("The maximum number of SCIM resources to return.");
const filterSchema = s.nonEmptyString("A SCIM filter expression accepted by Roam SCIM.");
const groupDisplayNameSchema = s.string("The Roam SCIM group displayName value.", {
  minLength: 1,
  maxLength: 64,
});
const memberIdsSchema = s.array(
  "Roam Person IDs to include as SCIM group members.",
  s.nonEmptyString("One Roam Person ID used as members[].value."),
);
const nonEmptyMemberIdsSchema = s.array(
  "Roam Person IDs to add, remove, or replace in a SCIM group.",
  s.nonEmptyString("One Roam Person ID used as members[].value."),
  { minItems: 1 },
);
const groupMemberOperationSchema = s.stringEnum(["add", "remove", "replace"], {
  description: "The SCIM PATCH operation to apply to the members attribute.",
});

const emptyInputSchema = s.actionInput({}, [], "No input parameters are required for this Roam SCIM request.");
const rawPayloadSchema = s.looseObject("The raw SCIM object returned by Roam.");

const scimStringArraySchema = s.array("SCIM schema URNs returned by Roam.", s.string("One SCIM schema URN."));

const scimNameSchema = s.looseObject("The SCIM name object returned for a Roam user.", {
  givenName: s.string("The givenName returned for the user."),
  familyName: s.string("The familyName returned for the user."),
});

const scimEmailSchema = s.looseObject("A SCIM email object returned for a Roam user.", {
  value: s.string("The email value returned by Roam SCIM."),
  type: s.string("The email type returned by Roam SCIM."),
  primary: s.boolean("Whether this email is the primary SCIM email."),
});

const roamRoleExtensionSchema = s.looseObject("The Roam SCIM user role extension object.", {
  role: roleSchema,
});

const scimMetaSchema = s.looseObject("SCIM metadata returned for the resource.", {
  location: s.string("The SCIM resource location URL."),
  resourceType: s.string("The SCIM resource type."),
});

const scimUserSchema = s.looseObject("A Roam SCIM user resource.", {
  schemas: scimStringArraySchema,
  id: s.string("The Roam Person ID returned as the SCIM user id."),
  userName: s.string("The SCIM userName returned by Roam, usually the primary email."),
  externalId: s.string("The externalId returned by Roam SCIM when present."),
  name: scimNameSchema,
  displayName: s.string("The display name returned by Roam SCIM."),
  emails: s.array("Email objects returned for the user.", scimEmailSchema),
  active: s.boolean("Whether the Roam user is active."),
  [roamScimUserRoleExtensionUrn]: roamRoleExtensionSchema,
  meta: scimMetaSchema,
});

const scimMemberSchema = s.looseObject("A SCIM group member object returned by Roam.", {
  value: s.string("The Roam Person ID for this group member."),
});

const scimGroupSchema = s.looseObject("A Roam SCIM group resource.", {
  schemas: scimStringArraySchema,
  id: s.string("The Roam Address ID returned as the SCIM group id."),
  displayName: s.string("The group displayName returned by Roam SCIM."),
  members: s.array("Members returned for the group.", scimMemberSchema),
  meta: scimMetaSchema,
});

const scimListEnvelopeSchema = {
  schemas: scimStringArraySchema,
  totalResults: s.nonNegativeInteger("Total matching SCIM resources across all pages."),
  startIndex: s.nonNegativeInteger("The one-based SCIM startIndex returned for this page."),
  itemsPerPage: s.nonNegativeInteger("The number of SCIM resources returned in this page."),
  raw: rawPayloadSchema,
};

const listUsersInputSchema = s.object(
  "Input parameters for listing Roam SCIM users.",
  {
    filter: filterSchema,
    startIndex: startIndexSchema,
    count: countSchema,
  },
  { optional: ["filter", "startIndex", "count"] },
);

const getResourceInputSchema = s.actionInput(
  {
    id: scimIdSchema,
  },
  ["id"],
  "Input parameters for retrieving one Roam SCIM resource.",
);

const createUserInputSchema = s.object(
  "Input payload for creating a Roam SCIM user.",
  {
    email: userEmailSchema,
    givenName: givenNameSchema,
    familyName: familyNameSchema,
    externalId: externalIdInputSchema,
    active: activeInputSchema,
    role: roleSchema,
  },
  { optional: ["externalId", "active", "role"] },
);

const replaceUserInputSchema = s.object(
  "Input payload for fully replacing supported Roam SCIM user attributes.",
  {
    id: scimIdSchema,
    email: userEmailSchema,
    givenName: givenNameSchema,
    familyName: familyNameSchema,
    externalId: externalIdInputSchema,
    active: activeInputSchema,
    role: roleSchema,
  },
  { optional: ["externalId", "active", "role"] },
);

const setUserActiveInputSchema = s.actionInput(
  {
    id: scimIdSchema,
    active: activeInputSchema,
  },
  ["id", "active"],
  "Input payload for replacing a Roam user's active flag.",
);

const listGroupsInputSchema = s.object(
  "Input parameters for listing Roam SCIM groups.",
  {
    filter: filterSchema,
    startIndex: startIndexSchema,
    count: countSchema,
  },
  { optional: ["filter", "startIndex", "count"] },
);

const createGroupInputSchema = s.object(
  "Input payload for creating a Roam SCIM group.",
  {
    displayName: groupDisplayNameSchema,
    memberIds: memberIdsSchema,
  },
  { optional: ["memberIds"] },
);

const replaceGroupInputSchema = s.object(
  "Input payload for fully replacing a Roam SCIM group.",
  {
    id: scimIdSchema,
    displayName: groupDisplayNameSchema,
    memberIds: memberIdsSchema,
  },
  { optional: ["memberIds"] },
);

const updateGroupMembersInputSchema = s.actionInput(
  {
    id: scimIdSchema,
    operation: groupMemberOperationSchema,
    memberIds: nonEmptyMemberIdsSchema,
  },
  ["id", "operation", "memberIds"],
  "Input payload for patching Roam SCIM group members.",
);

const deleteResourceOutputSchema = s.actionOutput(
  {
    id: scimIdSchema,
    archived: s.boolean("Whether the resource archive request completed."),
  },
  "The Roam SCIM archive response.",
);

export const roamScimActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_service_provider_config",
    description: "Get the Roam SCIM service provider configuration.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        config: rawPayloadSchema,
      },
      "The Roam SCIM service provider configuration response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Roam SCIM users with optional SCIM filtering and pagination.",
    requiredScopes: ["user:read", "user:read.email"],
    inputSchema: listUsersInputSchema,
    outputSchema: s.actionOutput(
      {
        users: s.array("Users returned in this page.", scimUserSchema),
        ...scimListEnvelopeSchema,
      },
      "A page of Roam SCIM users.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Roam SCIM user by Roam Person ID.",
    requiredScopes: ["user:read", "user:read.email"],
    inputSchema: getResourceInputSchema,
    outputSchema: s.actionOutput(
      {
        user: scimUserSchema,
      },
      "Single Roam SCIM user response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_user",
    description: "Create a Roam SCIM user from name, email, and optional role metadata.",
    requiredScopes: ["user:write"],
    inputSchema: createUserInputSchema,
    outputSchema: s.actionOutput(
      {
        user: scimUserSchema,
      },
      "Roam SCIM user creation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_user",
    description: "Fully replace supported attributes for a Roam SCIM user.",
    requiredScopes: ["user:write"],
    inputSchema: replaceUserInputSchema,
    outputSchema: s.actionOutput(
      {
        user: scimUserSchema,
      },
      "Roam SCIM user replacement response.",
    ),
  }),
  defineProviderAction(service, {
    name: "set_user_active",
    description: "Archive or reactivate a Roam SCIM user by replacing the active flag.",
    requiredScopes: ["user:write"],
    inputSchema: setUserActiveInputSchema,
    outputSchema: s.actionOutput(
      {
        user: scimUserSchema,
      },
      "Roam SCIM user active-state update response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    description: "Archive a Roam SCIM user by Roam Person ID.",
    requiredScopes: ["user:write"],
    inputSchema: getResourceInputSchema,
    outputSchema: deleteResourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Roam SCIM groups with optional pagination.",
    requiredScopes: ["user:read", "user:read.email"],
    inputSchema: listGroupsInputSchema,
    outputSchema: s.actionOutput(
      {
        groups: s.array("Groups returned in this page.", scimGroupSchema),
        ...scimListEnvelopeSchema,
      },
      "A page of Roam SCIM groups.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Get one Roam SCIM group by Roam Address ID.",
    requiredScopes: ["user:read", "user:read.email"],
    inputSchema: getResourceInputSchema,
    outputSchema: s.actionOutput(
      {
        group: scimGroupSchema,
      },
      "Single Roam SCIM group response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create a Roam SCIM group with optional initial members.",
    requiredScopes: ["user:write"],
    inputSchema: createGroupInputSchema,
    outputSchema: s.actionOutput(
      {
        group: scimGroupSchema,
      },
      "Roam SCIM group creation response.",
    ),
  }),
  defineProviderAction(service, {
    name: "replace_group",
    description: "Fully replace a Roam SCIM group display name and member list.",
    requiredScopes: ["user:write"],
    inputSchema: replaceGroupInputSchema,
    outputSchema: s.actionOutput(
      {
        group: scimGroupSchema,
      },
      "Roam SCIM group replacement response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_group_members",
    description: "Patch Roam SCIM group members with add, remove, or replace semantics.",
    requiredScopes: ["user:write"],
    inputSchema: updateGroupMembersInputSchema,
    outputSchema: s.actionOutput(
      {
        group: scimGroupSchema,
      },
      "Roam SCIM group member update response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Archive a Roam SCIM group by Roam Address ID.",
    requiredScopes: ["user:write"],
    inputSchema: getResourceInputSchema,
    outputSchema: deleteResourceOutputSchema,
  }),
];
