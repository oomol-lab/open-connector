import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const looseObjectSchema = s.looseRequiredObject("Schema for looseObjectSchema.", {});
const pageSizeField = s.optional(s.positiveInteger("Maximum number of results to return.", { maximum: 100 }));
const sinceField = s.optional(s.integer("Pagination cursor for results created after this timestamp."));
const untilField = s.optional(s.integer("Pagination cursor for results created before this timestamp."));
const deploymentIdOrUrlField = s.nonEmptyString("Vercel deployment ID or deployment URL.");
const paginationSchema = s.looseRequiredObject(
  "Vercel pagination information.",
  {
    count: s.optional(s.number("Number of items returned in this page.")),
    next: s.optional(s.nullable(s.number("Pagination cursor for the next page, or null when there is no next page."))),
    prev: s.optional(
      s.nullable(s.number("Pagination cursor for the previous page, or null when there is no previous page.")),
    ),
  },
  { optional: ["count", "next", "prev"] },
);
const deploymentSummarySchema = s.looseRequiredObject(
  "Vercel deployment summary.",
  {
    id: s.string("Vercel deployment ID."),
    name: s.optional(s.string("Deployment name.")),
    url: s.optional(s.string("Deployment URL.")),
    state: s.optional(s.string("Deployment state reported by Vercel.")),
    readyState: s.optional(s.string("Deployment readiness state reported by Vercel.")),
    target: s.optional(s.string("Deployment target such as production or preview.")),
    createdAt: s.optional(s.number("Deployment creation timestamp in milliseconds.")),
    ready: s.optional(s.number("Deployment ready timestamp in milliseconds.")),
    projectId: s.optional(s.string("Vercel project ID for the deployment.")),
    creator: s.optional(s.describe(looseObjectSchema, "Raw creator payload returned by Vercel for the deployment.")),
    meta: s.optional(s.describe(looseObjectSchema, "Raw metadata payload returned by Vercel for the deployment.")),
    alias: s.optional(s.array("Aliases currently assigned to the deployment.", s.string("An array item."))),
  },
  {
    optional: [
      "name",
      "url",
      "state",
      "readyState",
      "target",
      "createdAt",
      "ready",
      "projectId",
      "creator",
      "meta",
      "alias",
    ],
  },
);
const deploymentSchema = deploymentSummarySchema;
const deploymentTargetField = s.optional(
  s.stringEnum("Deployment target. Omit for a preview deployment.", ["production", "staging"]),
);
const deploymentSubmitFields = {
  name: s.nonEmptyString("Project name used in the deployment URL."),
  project: s.optional(s.nonEmptyString("Existing Vercel project ID or name that should receive the deployment.")),
  target: deploymentTargetField,
  customEnvironmentSlugOrId: s.optional(
    s.nonEmptyString("Custom environment slug or ID that should receive the deployment."),
  ),
  forceNew: s.optional(s.boolean("Whether to force a fresh build instead of reusing a similar deployment.")),
  skipAutoDetectionConfirmation: s.optional(
    s.boolean("Whether to continue without confirming a framework auto-detection change."),
  ),
  buildMachine: s.optional(s.stringEnum("Custom build machine to use for this deployment.", ["turbo"])),
  monorepoManager: s.optional(s.nonEmptyString("Monorepo manager to use for this deployment.")),
  meta: s.optional(s.record("String metadata to attach to the deployment.", s.string("Metadata value."))),
  projectSettings: s.optional(s.looseObject("Project settings to apply to this deployment.", {})),
};
const deploymentSubmitOptionalFields = [
  "project",
  "target",
  "customEnvironmentSlugOrId",
  "forceNew",
  "skipAutoDetectionConfirmation",
  "buildMachine",
  "monorepoManager",
  "meta",
  "projectSettings",
];
const deploymentFileReferenceSchema = s.object(
  "An uploaded Vercel deployment file reference.",
  {
    path: s.nonEmptyString("File path relative to the deployment root."),
    sha: s.string("SHA-1 digest returned by upload_deployment_file_from_url.", {
      minLength: 40,
      maxLength: 40,
    }),
    size: s.nonNegativeInteger("File size in bytes."),
  },
  { optional: [] },
);
const deploymentFileTreeSchema = s.looseRequiredObject(
  "A Vercel deployment file tree entry.",
  {
    name: s.string("File or directory name."),
    type: s.stringEnum("Deployment file tree entry type.", [
      "directory",
      "file",
      "invalid",
      "lambda",
      "middleware",
      "symlink",
    ]),
    mode: s.number("File mode indicating the entry type and permissions."),
    uid: s.optional(s.string("Unique Vercel file identifier for file entries.")),
    contentType: s.optional(s.string("Content type reported for file entries.")),
    children: s.optional(s.array("Nested file tree entries for a directory.", looseObjectSchema)),
  },
  { optional: ["uid", "contentType", "children"] },
);
const deploymentAliasSchema = s.looseRequiredObject(
  "A Vercel deployment alias.",
  {
    uid: s.string("Unique Vercel alias ID."),
    alias: s.string("Assigned alias hostname."),
    created: s.string("Alias creation timestamp."),
    redirect: s.optional(s.nullable(s.string("Redirect destination, or null when this alias serves the deployment."))),
    oldDeploymentId: s.optional(s.nullable(s.string("Previous deployment ID that owned the alias, when reassigned."))),
    protectionBypass: s.optional(s.looseObject("Protection bypass configuration attached to the alias.", {})),
  },
  { optional: ["redirect", "oldDeploymentId", "protectionBypass"] },
);
const promotionAliasSchema = s.object(
  "A Vercel production promotion alias status.",
  {
    id: s.string("Vercel alias ID."),
    alias: s.string("Alias hostname being mapped."),
    status: s.string("Current alias mapping status."),
  },
  { optional: [] },
);
const deploymentEventSchema = s.object(
  "Vercel deployment event.",
  {
    created: s.number("Deployment event timestamp in milliseconds."),
    type: s.string("Deployment event type."),
    payload: s.describe(looseObjectSchema, "Raw deployment event payload returned by Vercel."),
  },
  { optional: [] },
);
export const deploymentActions: ActionDefinition[] = [
  defineProviderAction("vercel", {
    name: "list_deployments",
    operationType: "read",
    description: "List Vercel deployments.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        app: s.optional(s.nonEmptyString("Deployment name to filter by.")),
        projectId: s.optional(s.nonEmptyString("Vercel project ID or name to filter by.")),
        projectIds: s.optional(
          s.array(
            "Vercel project IDs to filter by when projectId is omitted.",
            s.nonEmptyString("A Vercel project ID."),
            { minItems: 1, maxItems: 20 },
          ),
        ),
        limit: pageSizeField,
        since: sinceField,
        until: untilField,
        target: s.optional(s.nonEmptyString("Deployment environment to filter by.")),
        states: s.optional(
          s.array(
            "Deployment states to filter by.",
            s.stringEnum("A Vercel deployment state.", [
              "BUILDING",
              "ERROR",
              "INITIALIZING",
              "QUEUED",
              "READY",
              "CANCELED",
              "BLOCKED",
            ]),
            { minItems: 1 },
          ),
        ),
        userIds: s.optional(
          s.array("Vercel user IDs whose deployments should be returned.", s.nonEmptyString("A Vercel user ID."), {
            minItems: 1,
          }),
        ),
        rollbackCandidate: s.optional(s.boolean("Whether to return only deployments matching rollback candidacy.")),
        branch: s.optional(s.nonEmptyString("Git branch name to filter by.")),
        sha: s.optional(s.nonEmptyString("Git commit SHA to filter by.")),
      },
      {
        optional: [
          "app",
          "projectId",
          "projectIds",
          "target",
          "states",
          "userIds",
          "rollbackCandidate",
          "branch",
          "sha",
        ],
      },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        deployments: s.array("Vercel deployments.", deploymentSchema),
        pagination: s.optional(s.describe(paginationSchema, "Pagination cursors returned by Vercel.")),
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "get_deployment",
    operationType: "read",
    description: "Get a Vercel deployment.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "vercel.create_git_deployment",
      statusActionId: "vercel.get_deployment",
      cancelActionId: "vercel.cancel_deployment",
    },
    inputSchema: s.object(
      "The input payload for this action.",
      {
        idOrUrl: deploymentIdOrUrlField,
        withGitRepoInfo: s.optional(
          s.boolean("When true, include Git repository metadata in the deployment response."),
        ),
      },
      { optional: ["withGitRepoInfo"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        deployment: deploymentSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "create_git_deployment",
    operationType: "destructive",
    description: "Create an asynchronous Vercel deployment from a Git repository connected to the account.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "vercel.create_git_deployment",
      statusActionId: "vercel.get_deployment",
      cancelActionId: "vercel.cancel_deployment",
    },
    inputSchema: s.object(
      "The Git deployment request.",
      {
        ...deploymentSubmitFields,
        gitProvider: s.stringEnum("Git provider source type documented by Vercel.", [
          "vercel",
          "github",
          "github-limited",
          "gitlab",
          "bitbucket",
          "cursor-origin",
        ]),
        repositoryId: s.optional(s.nonEmptyString("Stable repository ID from the linked Vercel project's metadata.")),
        repositoryOwner: s.optional(s.nonEmptyString("GitHub organization or Bitbucket repository owner.")),
        repositoryName: s.optional(s.nonEmptyString("GitHub repository name or Bitbucket repository slug.")),
        ref: s.optional(s.nonEmptyString("Git branch, tag, or reference to deploy.")),
        sha: s.optional(s.nonEmptyString("Specific Git commit SHA to deploy.")),
        workspaceUuid: s.optional(s.nonEmptyString("Bitbucket workspace UUID associated with repositoryId.")),
        gitAccessToken: s.optional(
          s.string("Short-lived read-only GitHub token for Vercel platform accounts.", {
            minLength: 1,
            maxLength: 1024,
          }),
        ),
        gitMetadata: s.optional(s.looseObject("Git commit and CI metadata to attach to the deployment.", {})),
      },
      {
        optional: [
          ...deploymentSubmitOptionalFields,
          "repositoryId",
          "repositoryOwner",
          "repositoryName",
          "ref",
          "sha",
          "workspaceUuid",
          "gitAccessToken",
          "gitMetadata",
        ],
      },
    ),
    outputSchema: s.object(
      "The submitted Vercel deployment.",
      {
        deployment: deploymentSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "redeploy_deployment",
    operationType: "destructive",
    description: "Create an asynchronous Vercel deployment from an existing deployment's source and settings.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "vercel.redeploy_deployment",
      statusActionId: "vercel.get_deployment",
      cancelActionId: "vercel.cancel_deployment",
    },
    inputSchema: s.object(
      "The Vercel redeployment request.",
      {
        ...deploymentSubmitFields,
        deploymentId: s.nonEmptyString("Existing Vercel deployment ID to rebuild."),
        withLatestCommit: s.optional(
          s.boolean("Whether to rebuild from the latest commit instead of the original commit."),
        ),
      },
      {
        optional: [...deploymentSubmitOptionalFields, "withLatestCommit"],
      },
    ),
    outputSchema: s.object(
      "The submitted Vercel redeployment.",
      {
        deployment: deploymentSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "upload_deployment_file_from_url",
    operationType: "write",
    description:
      "Download one public file through the Connector SSRF guard, calculate its SHA-1 digest when needed, and upload up to 1 GiB through the Connector to Vercel for a file-based deployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Vercel deployment file upload request.",
      {
        fileUrl: s.url("Public URL of the file to download and upload to Vercel."),
        sha: s.optional(
          s.string("Known SHA-1 digest of the source file, if already available.", {
            minLength: 40,
            maxLength: 40,
          }),
        ),
        size: s.optional(s.nonNegativeInteger("Known source file size in bytes.")),
      },
      { optional: ["sha", "size"] },
    ),
    outputSchema: s.object(
      "The uploaded Vercel deployment file reference.",
      {
        sha: s.string("SHA-1 digest used to identify the uploaded file."),
        size: s.nonNegativeInteger("Uploaded file size in bytes."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "create_file_deployment",
    operationType: "destructive",
    description:
      "Create an asynchronous Vercel deployment from file references returned by upload_deployment_file_from_url.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "vercel.create_file_deployment",
      statusActionId: "vercel.get_deployment",
      cancelActionId: "vercel.cancel_deployment",
    },
    inputSchema: s.object(
      "The file-based Vercel deployment request.",
      {
        ...deploymentSubmitFields,
        files: s.array("Uploaded files to include in the deployment.", deploymentFileReferenceSchema, {
          minItems: 1,
          maxItems: 15000,
        }),
      },
      { optional: deploymentSubmitOptionalFields },
    ),
    outputSchema: s.object(
      "The submitted file-based Vercel deployment.",
      {
        deployment: deploymentSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "list_deployment_files",
    operationType: "read",
    description: "List the source file tree stored for a Vercel deployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The deployment file listing request.",
      {
        deploymentId: s.nonEmptyString("Vercel deployment ID."),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The Vercel deployment file tree.",
      {
        files: s.array("Top-level deployment file tree entries.", deploymentFileTreeSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "get_deployment_file_contents",
    operationType: "read",
    description: "Get one Vercel deployment file as base64-encoded content.",
    requiredScopes: [],
    inputSchema: s.object(
      "The deployment file content request.",
      {
        deploymentId: s.nonEmptyString("Vercel deployment ID."),
        fileId: s.nonEmptyString("Unique Vercel deployment file ID."),
        path: s.optional(s.nonEmptyString("File path required by Vercel for some Git deployments.")),
      },
      { optional: ["path"] },
    ),
    outputSchema: s.object(
      "The deployment file content returned by Vercel.",
      {
        contentBase64: s.string("Base64-encoded deployment file content when the upstream response is at most 16 MiB."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "list_deployment_aliases",
    operationType: "read",
    description: "List aliases currently assigned to a Vercel deployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The deployment alias listing request.",
      {
        deploymentId: s.nonEmptyString("Vercel deployment ID."),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "Aliases assigned to the deployment.",
      {
        aliases: s.array("Vercel deployment aliases.", deploymentAliasSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "assign_deployment_alias",
    operationType: "destructive",
    description: "Assign an alias to a Vercel deployment, moving it from any deployment that currently owns it.",
    requiredScopes: [],
    inputSchema: s.object(
      "The deployment alias assignment request.",
      {
        deploymentId: s.nonEmptyString("Stable Vercel deployment ID that should receive the alias."),
        alias: s.nonEmptyString("Alias hostname to assign to the deployment."),
        redirect: s.optional(
          s.nullable(s.nonEmptyString("Hostname that the alias should redirect to with status code 307.")),
        ),
      },
      { optional: ["redirect"] },
    ),
    outputSchema: s.object(
      "The assigned Vercel deployment alias.",
      {
        alias: deploymentAliasSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "update_deployment_integration_action",
    operationType: "destructive",
    description:
      "Update the status and optional outcomes of a Vercel Marketplace integration action attached to a deployment.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The deployment integration action update.",
        {
          deploymentId: s.nonEmptyString("Vercel deployment ID."),
          integrationConfigurationId: s.nonEmptyString("Vercel integration configuration ID."),
          resourceId: s.nonEmptyString("Vercel integration resource ID."),
          action: s.nonEmptyString("Integration deployment action identifier."),
          status: s.optional(s.stringEnum("Updated integration action status.", ["running", "succeeded", "failed"])),
          statusText: s.optional(s.nonEmptyString("Human-readable integration action status.")),
          statusUrl: s.optional(s.nonEmptyString("HTTP, HTTPS, or SSO URL with more status information.")),
          outcomes: s.optional(
            s.array(
              "Integration action outcomes such as resource secrets or claim rules.",
              s.looseObject("A Vercel integration action outcome.", {}),
            ),
          ),
        },
        { optional: ["status", "statusText", "statusUrl", "outcomes"] },
      ),
      ["status", "statusText", "statusUrl", "outcomes"],
    ),
    outputSchema: s.object(
      "The accepted integration action update.",
      {
        success: s.boolean("Whether Vercel accepted the integration action update."),
        deploymentId: s.string("Vercel deployment ID."),
        action: s.string("Updated integration deployment action identifier."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "cancel_deployment",
    operationType: "destructive",
    description: "Cancel a Vercel deployment that is still in progress.",
    requiredScopes: [],
    inputSchema: s.object(
      "The deployment cancellation request.",
      {
        deploymentId: s.nonEmptyString("Vercel deployment ID to cancel."),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The canceled Vercel deployment.",
      {
        deployment: deploymentSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "delete_deployment",
    operationType: "destructive",
    description: "Permanently delete a Vercel deployment.",
    requiredScopes: [],
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "The deployment deletion request.",
        {
          deploymentId: s.optional(s.nonEmptyString("Vercel deployment ID to delete.")),
          url: s.optional(s.nonEmptyString("Deployment or alias URL to resolve before deletion.")),
          expectedDeploymentId: s.optional(s.nonEmptyString("Deployment ID that url must resolve to before deletion.")),
        },
        { optional: ["deploymentId", "url", "expectedDeploymentId"] },
      ),
      ["deploymentId", "url"],
    ),
    outputSchema: s.object(
      "The deleted Vercel deployment reference.",
      {
        deploymentId: s.string("Deleted Vercel deployment ID."),
        state: s.stringEnum("Final deletion state reported by Vercel.", ["DELETED"]),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "promote_deployment",
    operationType: "destructive",
    description: "Request Vercel to point a project's production traffic to an existing deployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The production promotion request.",
      {
        projectId: s.nonEmptyString("Vercel project ID whose production traffic should change."),
        deploymentId: s.nonEmptyString("Vercel deployment ID to promote to production."),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The accepted production promotion.",
      {
        accepted: s.boolean("Whether Vercel accepted the production promotion request."),
        statusCode: s.integer("HTTP status code returned for the promotion request."),
        projectId: s.string("Vercel project ID from the accepted promotion request."),
        deploymentId: s.string("Vercel deployment ID from the accepted promotion request."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "rollback_deployment",
    operationType: "destructive",
    description: "Roll back a Vercel project's production traffic to a previous deployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The production rollback request.",
      {
        projectId: s.nonEmptyString("Vercel project ID whose production traffic should change."),
        deploymentId: s.nonEmptyString("Previous Vercel deployment ID to restore."),
        description: s.optional(s.nonEmptyString("Reason recorded for the rollback.")),
      },
      { optional: ["description"] },
    ),
    outputSchema: s.object(
      "The accepted production rollback.",
      {
        success: s.boolean("Whether Vercel accepted the production rollback."),
        projectId: s.string("Vercel project ID whose production traffic changed."),
        deploymentId: s.string("Previous Vercel deployment ID restored to production."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "get_latest_deployment_promotion_aliases",
    operationType: "read",
    description:
      "Get alias mapping statuses for the latest production promotion of a project; results are project-global and are not correlated to a specific promote_deployment call.",
    requiredScopes: [],
    inputSchema: s.object(
      "The production promotion alias status request.",
      {
        projectId: s.nonEmptyString("Vercel project ID."),
        limit: pageSizeField,
        since: sinceField,
        until: untilField,
        failedOnly: s.optional(s.boolean("Whether to return only aliases that failed to map.")),
      },
      { optional: ["failedOnly"] },
    ),
    outputSchema: s.object(
      "Alias mapping statuses for the latest production promotion.",
      {
        aliases: s.array("Promotion alias mapping statuses.", promotionAliasSchema),
        pagination: s.optional(s.describe(paginationSchema, "Pagination cursors returned by Vercel.")),
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "update_deployment_rollback_description",
    operationType: "write",
    description: "Update the recorded reason for a Vercel production rollback.",
    requiredScopes: [],
    inputSchema: s.object(
      "The rollback description update.",
      {
        projectId: s.nonEmptyString("Vercel project ID."),
        deploymentId: s.nonEmptyString("Deployment ID used as the rollback target."),
        description: s.string("Updated reason for the rollback."),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The accepted rollback description update.",
      {
        success: s.boolean("Whether Vercel accepted the rollback description update."),
        projectId: s.string("Vercel project ID."),
        deploymentId: s.string("Deployment ID used as the rollback target."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("vercel", {
    name: "get_deployment_events",
    operationType: "read",
    description: "Get Vercel deployment events.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      {
        idOrUrl: deploymentIdOrUrlField,
        limit: s.optional(
          s.integer("Maximum number of events to return, or -1 for all available events.", {
            minimum: -1,
          }),
        ),
        since: sinceField,
        until: untilField,
        direction: s.optional(s.stringEnum("Order in which to return deployment events.", ["forward", "backward"])),
        builds: s.optional(s.boolean("When true, include build events in the response.")),
        delimiter: s.optional(s.boolean("When true, include delimiter events between logical log sections.")),
        buildId: s.optional(s.nonEmptyString("Deployment build ID to filter events by.")),
        statusCode: s.optional(s.nonEmptyString("HTTP status code or status class such as 5xx to filter events by.")),
      },
      { optional: ["direction", "builds", "delimiter", "buildId", "statusCode"] },
    ),
    outputSchema: s.object(
      "The output payload for this action.",
      {
        events: s.array("Deployment events returned by Vercel.", deploymentEventSchema),
      },
      { optional: [] },
    ),
  }),
];
