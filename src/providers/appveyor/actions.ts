import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "appveyor";

const accountNameField = s.nonEmptyString("The AppVeyor account name used to scope requests for user-level API keys.");

const scopedInputSchema = s.object(
  "Optional AppVeyor account scoping parameters for this request.",
  {
    accountName: accountNameField,
  },
  { optional: ["accountName"] },
);

const roleIdField = s.positiveInteger("The AppVeyor role ID to retrieve.");

const appveyorProjectSchema = s.looseObject("An AppVeyor project returned by the projects API.", {
  projectId: s.integer("The numeric AppVeyor project ID."),
  accountId: s.integer("The numeric AppVeyor account ID that owns the project."),
  accountName: s.string("The AppVeyor account name that owns the project."),
  name: s.string("The AppVeyor project display name."),
  slug: s.string("The AppVeyor project slug."),
  repositoryType: s.string("The source repository provider type configured for the project."),
  repositoryScm: s.string("The source control management type configured for the project."),
  repositoryName: s.string("The repository name connected to the project."),
  isPrivate: s.boolean("Whether the connected repository is private."),
  created: s.string("The timestamp when the project was created."),
  updated: s.string("The timestamp when the project was last updated."),
});

const appveyorEnvironmentSchema = s.looseObject(
  "An AppVeyor deployment environment returned by the environments API.",
  {
    deploymentEnvironmentId: s.integer("The numeric AppVeyor deployment environment ID."),
    name: s.string("The AppVeyor deployment environment name."),
    provider: s.string("The AppVeyor deployment provider type."),
    created: s.string("The timestamp when the environment was created."),
    updated: s.string("The timestamp when the environment was last updated."),
  },
);

const appveyorUserSchema = s.looseObject("An AppVeyor user returned by the team API.", {
  accountId: s.integer("The numeric AppVeyor account ID associated with the user."),
  accountName: s.string("The AppVeyor account name associated with the user."),
  isOwner: s.boolean("Whether the user owns the AppVeyor account."),
  isCollaborator: s.boolean("Whether the user is an AppVeyor collaborator."),
  userId: s.integer("The numeric AppVeyor user ID."),
  fullName: s.string("The AppVeyor user's full name."),
  email: s.string("The AppVeyor user's email address."),
  roleId: s.integer("The numeric AppVeyor role ID assigned to the user."),
  roleName: s.string("The AppVeyor role name assigned to the user."),
  created: s.string("The timestamp when the user was added."),
  updated: s.string("The timestamp when the user was last updated."),
});

const appveyorRoleSchema = s.looseObject("An AppVeyor role returned by the team API.", {
  roleId: roleIdField,
  name: s.string("The AppVeyor role name."),
  isSystem: s.boolean("Whether the role is an AppVeyor system role."),
  created: s.string("The timestamp when the role was created."),
  updated: s.string("The timestamp when the role was last updated."),
});

const appveyorArtifactSchema = s.looseObject("An AppVeyor build artifact returned by the build job artifacts API.", {
  fileName: s.string("The artifact file name."),
  name: s.string("The artifact display name when AppVeyor returns one."),
  type: s.string("The AppVeyor artifact type."),
  size: s.integer("The artifact size in bytes when AppVeyor returns it."),
  created: s.string("The timestamp when the artifact was created."),
});

export const appveyorActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_projects",
    operationType: "read",
    description: "List AppVeyor projects accessible to the connected API token.",
    inputSchema: scopedInputSchema,
    outputSchema: s.object("The normalized AppVeyor projects list.", {
      projects: s.array("The AppVeyor projects returned by the request.", appveyorProjectSchema),
      count: s.nonNegativeInteger("The number of AppVeyor projects returned by the request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_environments",
    operationType: "read",
    description: "List AppVeyor deployment environments accessible to the connected API token.",
    inputSchema: scopedInputSchema,
    outputSchema: s.object("The normalized AppVeyor environments list.", {
      environments: s.array("The AppVeyor deployment environments returned by the request.", appveyorEnvironmentSchema),
      count: s.nonNegativeInteger("The number of AppVeyor environments returned by the request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_users",
    operationType: "read",
    description: "List AppVeyor team users accessible to the connected API token.",
    inputSchema: scopedInputSchema,
    outputSchema: s.object("The normalized AppVeyor users list.", {
      users: s.array("The AppVeyor users returned by the request.", appveyorUserSchema),
      count: s.nonNegativeInteger("The number of AppVeyor users returned by the request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_roles",
    operationType: "read",
    description: "List AppVeyor team roles accessible to the connected API token.",
    inputSchema: scopedInputSchema,
    outputSchema: s.object("The normalized AppVeyor roles list.", {
      roles: s.array("The AppVeyor roles returned by the request.", appveyorRoleSchema),
      count: s.nonNegativeInteger("The number of AppVeyor roles returned by the request."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_role",
    operationType: "read",
    description: "Retrieve one AppVeyor team role by ID.",
    inputSchema: s.object(
      "Input parameters for retrieving one AppVeyor role.",
      {
        accountName: accountNameField,
        roleId: roleIdField,
      },
      { optional: ["accountName"] },
    ),
    outputSchema: s.object("The normalized AppVeyor role response.", {
      role: appveyorRoleSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_build_artifacts",
    operationType: "read",
    description: "List artifacts produced by one AppVeyor build job.",
    inputSchema: s.object(
      "Input parameters for listing artifacts produced by one AppVeyor build job.",
      {
        accountName: accountNameField,
        jobId: s.nonEmptyString("The AppVeyor build job ID whose artifacts should be listed."),
      },
      { optional: ["accountName"] },
    ),
    outputSchema: s.object("The normalized AppVeyor build artifacts list.", {
      artifacts: s.array("The AppVeyor build artifacts returned by the request.", appveyorArtifactSchema),
      count: s.nonNegativeInteger("The number of AppVeyor artifacts returned by the request."),
    }),
  }),
];
