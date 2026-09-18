import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "neon";

const dateTimeSchema = s.string("Timestamp in ISO 8601 format.");
const projectIdSchema = s.nonEmptyString("The Neon project ID.");
const branchIdSchema = s.nonEmptyString("The Neon branch ID.");
const databaseNameSchema = s.nonEmptyString("The Neon database name.");
const operationIdSchema = s.uuid("The Neon operation ID.");
const cursorSchema = s.nonEmptyString("Pagination cursor returned by a previous Neon response.");
const searchSchema = s.nonEmptyString("Search string used to filter records by name or identifier.");
const orgIdSchema = s.nonEmptyString("Organization ID used to scope project listing or creation.");
const pgVersionSchema = s.integer("Postgres major version to provision for the project.", {
  minimum: 14,
  maximum: 18,
});
const historyRetentionSecondsSchema = s.integer("Shared history retention period in seconds.", {
  minimum: 0,
  maximum: 2592000,
});
const branchNameSchema = s.string({
  minLength: 1,
  maxLength: 256,
  description: "The Neon branch name.",
});
const projectNameSchema = s.string({
  minLength: 1,
  maxLength: 256,
  description: "The Neon project name.",
});
const roleNameSchema = s.nonEmptyString("The Neon role name.");
const regionIdSchema = s.nonEmptyString("The Neon region identifier.");
const looseObjectSchema = s.unknownObject("A JSON object returned by Neon.");

const paginationSchema = s.object(
  "Pagination metadata returned by Neon.",
  {
    cursor: s.string("Cursor token for the next page when Neon uses cursor pagination."),
    next: s.string("Opaque cursor for the next page when Neon returns next-page pagination."),
    sortBy: s.string("Field Neon used to sort the current page, when present."),
    sortOrder: s.string("Sort order Neon used for the current page, when present."),
  },
  {
    optional: ["cursor", "next", "sortBy", "sortOrder"],
    additionalProperties: true,
  },
);

const currentUserSchema = s.object(
  "Authenticated Neon user.",
  {
    id: s.string("Unique identifier of the authenticated Neon user."),
    email: s.email("Email address of the authenticated Neon user."),
    login: s.string("Deprecated login identifier reported by Neon."),
    name: s.string("Given name of the authenticated Neon user."),
    lastName: s.string("Family name of the authenticated Neon user."),
    image: s.string("Avatar URL of the authenticated Neon user."),
    activeSecondsLimit: s.integer("Active endpoint seconds available to the user plan."),
    projectsLimit: s.integer("Project limit of the authenticated Neon user."),
    branchesLimit: s.integer("Branch limit of the authenticated Neon user."),
    maxAutoscalingLimit: s.number("Maximum autoscaling limit in Compute Units for the user plan."),
    computeSecondsLimit: s.integer("Compute seconds limit for the user plan, when present."),
    plan: s.string("Current plan name for the authenticated Neon user."),
    authAccounts: s.array("Authentication accounts attached to the Neon user.", looseObjectSchema),
    billingAccount: looseObjectSchema,
  },
  {
    optional: ["login", "computeSecondsLimit", "billingAccount"],
    additionalProperties: true,
  },
);

const projectSchema = s.object(
  "Neon project.",
  {
    id: projectIdSchema,
    platformId: s.string("Cloud platform identifier for the project."),
    regionId: s.string("Cloud region identifier for the project."),
    name: s.string("Project name."),
    provisioner: s.string("Neon provisioner used by the project."),
    pgVersion: s.integer("Postgres major version configured for the project."),
    proxyHost: s.string("Proxy host used to connect to the project."),
    branchLogicalSizeLimit: s.integer("Logical size limit per branch in MiB."),
    branchLogicalSizeLimitBytes: s.integer("Logical size limit per branch in bytes."),
    storePasswords: s.boolean("Whether role passwords are stored for the project."),
    creationSource: s.string("Source that created the project."),
    historyRetentionSeconds: s.integer("Shared history retention period in seconds."),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    ownerId: s.string("User or organization owner ID for the project."),
    orgId: s.string("Organization ID that owns the project, when present."),
    orgName: s.string("Organization name that owns the project, when present."),
    activeTime: s.integer("Observed active time in seconds for list responses, when present."),
    activeTimeSeconds: s.integer("Observed active time in seconds for detailed responses, when present."),
    computeTimeSeconds: s.integer("Observed compute time in seconds for the project, when present."),
    dataTransferBytes: s.integer("Egress bytes measured for the project, when present."),
    writtenDataBytes: s.integer("Write-ahead log bytes measured for the project, when present."),
    dataStorageBytesHour: s.integer("Accumulated storage consumption in bytes-hour, when present."),
    consumptionPeriodStart: s.string("Timestamp when the current consumption period started, when present."),
    consumptionPeriodEnd: s.string("Timestamp when the current consumption period ends, when present."),
    computeLastActiveAt: s.string("Most recent timestamp when any endpoint in the project was active."),
    deletedAt: s.string("Timestamp when the project was deleted, when present."),
    recoverableUntil: s.string("Timestamp until which the deleted project remains recoverable, when present."),
    defaultEndpointSettings: looseObjectSchema,
    settings: looseObjectSchema,
    owner: looseObjectSchema,
  },
  {
    optional: [
      "orgId",
      "orgName",
      "activeTime",
      "activeTimeSeconds",
      "computeTimeSeconds",
      "dataTransferBytes",
      "writtenDataBytes",
      "dataStorageBytesHour",
      "consumptionPeriodStart",
      "consumptionPeriodEnd",
      "computeLastActiveAt",
      "deletedAt",
      "recoverableUntil",
      "defaultEndpointSettings",
      "settings",
      "owner",
    ],
    additionalProperties: true,
  },
);

const annotationSchema = s.object(
  "Neon annotation.",
  {
    object: s.object(
      "Annotated Neon object.",
      {
        type: s.string("Annotation object type."),
        id: s.string("Identifier of the annotated object."),
      },
      { additionalProperties: true },
    ),
    value: s.record("Annotation values attached to the Neon object.", true),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  },
  {
    optional: ["createdAt", "updatedAt"],
    additionalProperties: true,
  },
);

const branchSchema = s.object(
  "Neon branch.",
  {
    id: branchIdSchema,
    projectId: projectIdSchema,
    parentId: s.string("Parent branch ID, when the branch has one."),
    parentLsn: s.string("Parent Log Sequence Number, when present."),
    parentTimestamp: s.string("Parent point-in-time timestamp used for the branch, when present."),
    name: s.string("Branch name."),
    currentState: s.string("Current state reported by Neon for the branch."),
    pendingState: s.string("Pending state reported by Neon for the branch, when present."),
    stateChangedAt: dateTimeSchema,
    logicalSize: s.integer("Logical size of the branch in bytes, when present."),
    creationSource: s.string("Source that created the branch."),
    default: s.boolean("Whether the branch is the project's default branch."),
    protected: s.boolean("Whether the branch is protected."),
    cpuUsedSec: s.integer("Deprecated CPU seconds metric reported by Neon, when present."),
    computeTimeSeconds: s.integer("Observed compute time in seconds for the branch."),
    activeTimeSeconds: s.integer("Observed active time in seconds for the branch."),
    writtenDataBytes: s.integer("Write bytes measured for the branch."),
    dataTransferBytes: s.integer("Data transfer bytes measured for the branch."),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    initSource: s.string("Initialization source used to create the branch, when present."),
    expiresAt: s.string("Expiration timestamp for the branch, when present."),
    lastResetAt: s.string("Timestamp when the branch was last reset, when present."),
    ttlIntervalSeconds: s.integer("Original time-to-live interval for the branch, when present."),
    createdBy: looseObjectSchema,
    restoreStatus: s.string("Restore status reported by Neon, when present."),
    restoredFrom: s.string("Snapshot ID used as the restore source, when present."),
    restoredAs: s.string("Branch ID replaced by this restore result, when present."),
    restrictedActions: s.array("Actions currently restricted for this branch, when present.", looseObjectSchema),
  },
  {
    optional: [
      "parentId",
      "parentLsn",
      "parentTimestamp",
      "pendingState",
      "logicalSize",
      "cpuUsedSec",
      "initSource",
      "expiresAt",
      "lastResetAt",
      "ttlIntervalSeconds",
      "createdBy",
      "restoreStatus",
      "restoredFrom",
      "restoredAs",
      "restrictedActions",
    ],
    additionalProperties: true,
  },
);

const databaseSchema = s.object(
  "Neon database.",
  {
    id: s.integer("Unique identifier of the database."),
    branchId: branchIdSchema,
    name: s.string("Database name."),
    ownerName: s.string("Role name that owns the database."),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  },
  { additionalProperties: true },
);

const operationSchema = s.object(
  "Neon operation.",
  {
    id: operationIdSchema,
    projectId: projectIdSchema,
    branchId: s.string("Branch ID associated with the operation, when present."),
    endpointId: s.string("Endpoint ID associated with the operation, when present."),
    action: s.string("Action performed by the Neon operation."),
    status: s.string("Current status of the Neon operation."),
    error: s.string("Error message reported for the operation, when present."),
    failuresCount: s.integer("Number of failures recorded for the operation."),
    retryAt: s.string("Timestamp when the operation will retry, when present."),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    totalDurationMs: s.integer("Total duration of the operation in milliseconds."),
  },
  {
    optional: ["branchId", "endpointId", "error", "retryAt"],
    additionalProperties: true,
  },
);

const listProjectsOutputSchema = s.actionOutput(
  {
    projects: s.array("Projects returned by Neon.", projectSchema),
    unavailableProjectIds: s.array(
      "Project IDs Neon could not fully retrieve before the list timeout, if any.",
      s.string("Project ID that was unavailable during Neon project listing."),
    ),
    pagination: s.nullable(paginationSchema),
  },
  "Paginated Neon project list.",
);

const createProjectOutputSchema = s.actionOutput(
  {
    project: projectSchema,
    branch: s.nullable(branchSchema),
    databases: s.array("Databases Neon returned as part of the project creation response.", databaseSchema),
    operations: s.array("Operations triggered by the project creation request.", operationSchema),
  },
  "Result of creating a Neon project.",
);

const branchMutationOutputSchema = s.actionOutput(
  {
    branch: branchSchema,
    operations: s.array("Operations triggered by the branch mutation request.", operationSchema),
  },
  "Result of a Neon branch mutation.",
);

const deleteBranchOutputSchema = s.actionOutput(
  {
    deleted: s.literal(true, { description: "Whether the delete branch request was accepted." }),
    branch: s.nullable(branchSchema),
    operations: s.array("Operations triggered by the branch deletion request.", operationSchema),
  },
  "Result of deleting a Neon branch.",
);

const listBranchesOutputSchema = s.actionOutput(
  {
    branches: s.array("Branches returned by Neon.", branchSchema),
    annotations: s.record("Branch annotations keyed by branch ID.", annotationSchema),
    pagination: s.nullable(paginationSchema),
  },
  "Paginated Neon branch list.",
);

const databaseMutationOutputSchema = s.actionOutput(
  {
    database: databaseSchema,
    operations: s.array("Operations triggered by the database mutation request.", operationSchema),
  },
  "Result of a Neon database mutation.",
);

const deleteDatabaseOutputSchema = s.actionOutput(
  {
    deleted: s.literal(true, { description: "Whether the delete database request was accepted." }),
    database: s.nullable(databaseSchema),
    operations: s.array("Operations triggered by the database deletion request.", operationSchema),
  },
  "Result of deleting a Neon database.",
);

const updateProjectInputSchema = {
  ...s.actionInput(
    {
      projectId: projectIdSchema,
      name: projectNameSchema,
      historyRetentionSeconds: historyRetentionSecondsSchema,
    },
    ["projectId"],
  ),
  anyOf: [{ required: ["name"] }, { required: ["historyRetentionSeconds"] }],
} satisfies JsonSchema;

const createBranchInputSchema = {
  ...s.actionInput(
    {
      projectId: projectIdSchema,
      name: branchNameSchema,
      parentId: s.nonEmptyString("Parent branch ID used as the source for the new branch."),
      parentLsn: s.nonEmptyString("Log Sequence Number on the parent branch used to create the new branch."),
      parentTimestamp: s.nonEmptyString("Point-in-time timestamp on the parent branch used to create the new branch."),
      protected: s.boolean("Whether the branch should be protected."),
      initSource: s.stringEnum("How the new branch should be initialized from the parent branch.", [
        "schema-only",
        "parent-data",
      ]),
    },
    ["projectId", "name"],
  ),
  not: { required: ["parentLsn", "parentTimestamp"] },
} satisfies JsonSchema;

const updateBranchInputSchema = {
  ...s.actionInput(
    {
      projectId: projectIdSchema,
      branchId: branchIdSchema,
      name: branchNameSchema,
      protected: s.boolean("Whether the branch should be protected."),
    },
    ["projectId", "branchId"],
  ),
  anyOf: [{ required: ["name"] }, { required: ["protected"] }],
} satisfies JsonSchema;

const updateDatabaseInputSchema = {
  ...s.actionInput(
    {
      projectId: projectIdSchema,
      branchId: branchIdSchema,
      databaseName: databaseNameSchema,
      newName: s.nonEmptyString("New database name to assign, when renaming the database."),
      ownerName: s.nonEmptyString("New role name that should own the database."),
    },
    ["projectId", "branchId", "databaseName"],
  ),
  anyOf: [{ required: ["newName"] }, { required: ["ownerName"] }],
} satisfies JsonSchema;

export const neonActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the currently authenticated Neon user profile.",
    inputSchema: s.actionInput({}),
    outputSchema: currentUserSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Neon projects available to the authenticated account.",
    inputSchema: s.actionInput({
      cursor: cursorSchema,
      limit: s.integer("Maximum number of projects to return.", { minimum: 1, maximum: 400 }),
      search: searchSchema,
      orgId: orgIdSchema,
      recoverable: s.boolean("Whether to return only deleted projects within the recovery window."),
    }),
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get detailed metadata for a Neon project.",
    inputSchema: s.actionInput({ projectId: projectIdSchema }, ["projectId"]),
    outputSchema: s.actionOutput({ project: projectSchema }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create a Neon project with an optional default branch configuration.",
    inputSchema: s.actionInput(
      {
        name: projectNameSchema,
        orgId: orgIdSchema,
        regionId: regionIdSchema,
        pgVersion: pgVersionSchema,
        branchName: branchNameSchema,
        databaseName: databaseNameSchema,
        roleName: roleNameSchema,
        storePasswords: s.boolean("Whether Neon should store role passwords for the project."),
        historyRetentionSeconds: historyRetentionSecondsSchema,
      },
      ["name"],
    ),
    outputSchema: createProjectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    operationType: "write",
    description: "Update a Neon project name or history retention period.",
    inputSchema: updateProjectInputSchema,
    outputSchema: s.actionOutput({
      project: projectSchema,
      operations: s.array("Operations triggered by the project update request.", operationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_project",
    operationType: "destructive",
    description: "Delete a Neon project.",
    inputSchema: s.actionInput({ projectId: projectIdSchema }, ["projectId"]),
    outputSchema: s.actionOutput(
      {
        deleted: s.literal(true, { description: "Whether the delete project request was accepted." }),
        project: projectSchema,
      },
      "Result of deleting a Neon project.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_branches",
    operationType: "read",
    description: "List branches for a Neon project.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        search: searchSchema,
        sortBy: s.stringEnum("Field used to sort Neon branches.", ["name", "created_at", "updated_at"]),
        sortOrder: s.stringEnum("Sort order to apply to branch results.", ["asc", "desc"]),
        cursor: cursorSchema,
        limit: s.integer("Maximum number of records to return.", { minimum: 1, maximum: 10000 }),
      },
      ["projectId"],
    ),
    outputSchema: listBranchesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_branch",
    operationType: "read",
    description: "Get detailed metadata for a Neon branch.",
    inputSchema: s.actionInput({ projectId: projectIdSchema, branchId: branchIdSchema }, ["projectId", "branchId"]),
    outputSchema: s.actionOutput({
      branch: branchSchema,
      annotation: s.nullable(annotationSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_branch",
    operationType: "write",
    description: "Create a branch in a Neon project.",
    inputSchema: createBranchInputSchema,
    outputSchema: branchMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_branch",
    operationType: "write",
    description: "Update a Neon branch name or protection status.",
    inputSchema: updateBranchInputSchema,
    outputSchema: branchMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_branch",
    operationType: "destructive",
    description: "Delete a branch from a Neon project.",
    inputSchema: s.actionInput({ projectId: projectIdSchema, branchId: branchIdSchema }, ["projectId", "branchId"]),
    outputSchema: deleteBranchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_databases",
    operationType: "read",
    description: "List databases for a Neon branch.",
    inputSchema: s.actionInput({ projectId: projectIdSchema, branchId: branchIdSchema }, ["projectId", "branchId"]),
    outputSchema: s.actionOutput({ databases: s.array("Databases returned by Neon.", databaseSchema) }),
  }),
  defineProviderAction(service, {
    name: "get_database",
    operationType: "read",
    description: "Get detailed metadata for a Neon database.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        databaseName: databaseNameSchema,
      },
      ["projectId", "branchId", "databaseName"],
    ),
    outputSchema: s.actionOutput({ database: databaseSchema }),
  }),
  defineProviderAction(service, {
    name: "create_database",
    operationType: "write",
    description: "Create a database in a Neon branch.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        name: s.nonEmptyString("Name of the database to create."),
        ownerName: s.nonEmptyString("Role name that should own the new database."),
      },
      ["projectId", "branchId", "name", "ownerName"],
    ),
    outputSchema: databaseMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_database",
    operationType: "write",
    description: "Update a Neon database name or owner.",
    inputSchema: updateDatabaseInputSchema,
    outputSchema: databaseMutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_database",
    operationType: "destructive",
    description: "Delete a database from a Neon branch.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        branchId: branchIdSchema,
        databaseName: databaseNameSchema,
      },
      ["projectId", "branchId", "databaseName"],
    ),
    outputSchema: deleteDatabaseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_operations",
    operationType: "read",
    description: "List operations for a Neon project.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        cursor: cursorSchema,
        limit: s.integer("Maximum number of operations to return.", { minimum: 1, maximum: 1000 }),
      },
      ["projectId"],
    ),
    outputSchema: s.actionOutput(
      {
        operations: s.array("Operations returned by Neon.", operationSchema),
        pagination: s.nullable(paginationSchema),
      },
      "Paginated Neon operation list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_operation",
    operationType: "read",
    description: "Get detailed metadata for a Neon operation.",
    inputSchema: s.actionInput(
      {
        projectId: projectIdSchema,
        operationId: operationIdSchema,
      },
      ["projectId", "operationId"],
    ),
    outputSchema: s.actionOutput({ operation: operationSchema }),
  }),
];
