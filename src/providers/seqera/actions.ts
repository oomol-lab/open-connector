import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "seqera";

const userIdField = s.positiveInteger("The Seqera numeric user ID.");
const orgIdField = s.positiveInteger("The Seqera numeric organization ID.");
const workspaceIdField = s.positiveInteger("The Seqera numeric workspace ID.");
const pipelineIdField = s.positiveInteger("The Seqera numeric pipeline ID.");
const sourceWorkspaceIdField = s.positiveInteger(
  "The source workspace numeric ID used when resolving shared resources.",
);
const workflowIdField = s.nonEmptyString("The Seqera workflow ID.");
const maxField = s.nonNegativeInteger("The maximum number of records to return.");
const offsetField = s.nonNegativeInteger("The zero-based offset of the first record to return.");

const pipelineAttributeSchema = s.stringEnum("One pipeline response attribute requested from Seqera.", [
  "labels",
  "optimized",
  "computeEnv",
]);
const workflowAttributeSchema = s.stringEnum("One workflow response attribute requested from Seqera.", [
  "labels",
  "optimized",
  "messages",
  "minimal",
  "pipelineInfo",
]);

const labelSchema = s.looseObject("A Seqera label object.");
const jobInfoSchema = s.looseObject("A Seqera job info object.");
const platformSchema = s.looseObject("A Seqera compute platform object.");
const computeEnvSchema = s.looseObject("A Seqera compute environment summary object.");

const userSchema = s.looseObject("A Seqera user profile object.", {
  id: userIdField,
  email: s.string("The email address of the current Seqera user."),
  firstName: s.string("The first name of the current Seqera user."),
  lastName: s.string("The last name of the current Seqera user."),
  organization: s.string("The organization name associated with the current Seqera user."),
  userName: s.string("The Seqera username of the current user."),
  avatar: s.string("The avatar URL of the current Seqera user."),
  dateCreated: s.string("The timestamp when the Seqera user was created."),
  lastAccess: s.string("The timestamp of the most recent access by the Seqera user."),
});

const orgAndWorkspaceSchema = s.looseObject("A Seqera organization and workspace membership record.", {
  orgId: orgIdField,
  orgName: s.string("The name of the organization that owns the workspace."),
  orgType: s.string("The Seqera organization type."),
  orgLogoUrl: s.string("The organization logo URL, when available."),
  workspaceId: workspaceIdField,
  workspaceName: s.string("The workspace name."),
  workspaceFullName: s.string("The fully qualified workspace name in Seqera."),
  visibility: s.string("The workspace visibility value returned by Seqera."),
  roles: s.stringArray("The roles granted to the current user in the workspace.", {
    itemDescription: "One role granted to the current user in the workspace.",
  }),
});

const workspaceSchema = s.looseObject("A Seqera workspace object.", {
  id: workspaceIdField,
  name: s.string("The workspace name."),
  fullName: s.string("The fully qualified workspace name."),
  description: s.string("The workspace description."),
  visibility: s.string("The workspace visibility value returned by Seqera."),
  dateCreated: s.string("The timestamp when the workspace was created."),
  lastUpdated: s.string("The timestamp when the workspace was last updated."),
});

const pipelineVersionSchema = s.looseObject("A Seqera pipeline version summary object.", {
  id: s.string("The Seqera pipeline version ID."),
  name: s.string("The pipeline version name."),
  hash: s.string("The content hash of the pipeline version."),
  isDefault: s.boolean("Whether this version is the default pipeline version."),
  isDraftVersion: s.boolean("Whether this version is still a draft version."),
  dateCreated: s.string("The timestamp when the pipeline version was created."),
  lastUpdated: s.string("The timestamp when the pipeline version was last updated."),
});

const pipelineSchema = s.looseObject("A Seqera pipeline object.", {
  pipelineId: pipelineIdField,
  name: s.string("The pipeline name."),
  description: s.string("The pipeline description."),
  repository: s.string("The Git repository URL associated with the pipeline."),
  visibility: s.string("The pipeline visibility value returned by Seqera."),
  workspaceId: workspaceIdField,
  workspaceName: s.string("The workspace name that owns the pipeline."),
  orgId: orgIdField,
  orgName: s.string("The organization name that owns the pipeline."),
  userId: userIdField,
  userName: s.string("The username of the pipeline owner."),
  optimizationId: s.string("The optimization identifier, when present."),
  optimizationStatus: s.string("The optimization status reported by Seqera."),
  optimizationTargets: s.string("The optimization targets reported by Seqera."),
  labels: s.array("The pipeline labels returned when the labels attribute is requested.", labelSchema),
  computeEnv: computeEnvSchema,
  version: pipelineVersionSchema,
  icon: s.string("The icon URL associated with the pipeline, when present."),
  deleted: s.boolean("Whether the pipeline has been marked as deleted."),
  lastUpdated: s.string("The timestamp when the pipeline was last updated."),
});

const pipelineInfoSchema = s.looseObject("A Seqera workflow pipeline reference object.", {
  id: pipelineIdField,
  workspaceId: workspaceIdField,
  version: pipelineVersionSchema,
});

const progressDataSchema = s.looseObject("A Seqera workflow progress summary object.", {
  pending: s.integer("The number of pending tasks."),
  submitted: s.integer("The number of submitted tasks."),
  running: s.integer("The number of running tasks."),
  succeeded: s.integer("The number of succeeded tasks."),
  failed: s.integer("The number of failed tasks."),
  aborted: s.integer("The number of aborted tasks."),
  cached: s.integer("The number of cached tasks."),
});

const workflowSchema = s.looseObject("A Seqera workflow object.", {
  id: workflowIdField,
  runName: s.string("The workflow run name."),
  status: s.stringEnum("The workflow status reported by Seqera.", [
    "SUBMITTED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "UNKNOWN",
  ]),
  repository: s.string("The Git repository URL used for the workflow run."),
  revision: s.string("The Git revision used for the workflow run."),
  launchId: s.string("The launch identifier associated with the workflow."),
  projectName: s.string("The Nextflow project name associated with the workflow."),
  profile: s.string("The Nextflow profile string used for the workflow."),
  sessionId: s.string("The Nextflow session ID."),
  start: s.string("The workflow start timestamp."),
  submit: s.string("The workflow submission timestamp."),
  complete: s.string("The workflow completion timestamp."),
  duration: s.integer("The workflow duration in milliseconds."),
  success: s.boolean("Whether the workflow completed successfully."),
  errorMessage: s.string("The workflow error message, when present."),
  userName: s.string("The Seqera username that launched the workflow."),
  workDir: s.string("The workflow work directory."),
  launchDir: s.string("The workflow launch directory."),
  deleted: s.boolean("Whether the workflow has been deleted."),
});

const workflowListElementSchema = s.object(
  "One Seqera workflow list element.",
  {
    workflow: workflowSchema,
    progress: progressDataSchema,
    pipelineInfo: pipelineInfoSchema,
    labels: s.array("The workflow labels returned when the labels attribute is requested.", labelSchema),
    optimized: s.boolean("Whether Seqera marked the workflow as optimized."),
    starred: s.boolean("Whether the current user starred the workflow."),
    orgId: orgIdField,
    orgName: s.string("The organization name associated with the workflow."),
    workspaceId: workspaceIdField,
    workspaceName: s.string("The workspace name associated with the workflow."),
  },
  {
    optional: [
      "progress",
      "pipelineInfo",
      "labels",
      "optimized",
      "starred",
      "orgId",
      "orgName",
      "workspaceId",
      "workspaceName",
    ],
  },
);

export const seqeraActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the current Seqera user profile and default workspace information.",
    inputSchema: s.actionInput({}, [], "No input is required."),
    outputSchema: s.object(
      "The current Seqera user profile response.",
      {
        user: userSchema,
        defaultWorkspaceId: workspaceIdField,
        needConsent: s.boolean("Whether the current Seqera user still needs to grant product consent."),
      },
      { required: ["user"], optional: ["defaultWorkspaceId", "needConsent"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_user_workspaces",
    description: "List the workspaces and organizations visible to the current Seqera user.",
    inputSchema: s.actionInput(
      {
        userId: userIdField,
      },
      [],
      "Input parameters for listing the current user's Seqera workspaces.",
    ),
    outputSchema: s.actionOutput(
      {
        orgsAndWorkspaces: s.array("The workspaces and organizations visible to the user.", orgAndWorkspaceSchema),
      },
      "The Seqera workspace membership list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Retrieve one Seqera workspace by organization ID and workspace ID.",
    inputSchema: s.actionInput(
      {
        orgId: orgIdField,
        workspaceId: workspaceIdField,
      },
      ["orgId", "workspaceId"],
      "Input parameters for retrieving a Seqera workspace.",
    ),
    outputSchema: s.actionOutput({ workspace: workspaceSchema }, "The Seqera workspace detail response."),
  }),
  defineProviderAction(service, {
    name: "list_pipelines",
    description: "List Seqera pipelines in the current user context or a specific workspace.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdField,
        max: maxField,
        offset: offsetField,
        sortBy: s.stringEnum("The Seqera pipeline sort field.", ["CREATED", "MODIFIED", "NAME"]),
        sortDir: s.stringEnum("The Seqera pipeline sort direction.", ["ASCENDING", "DESCENDING"]),
        search: s.nonEmptyString("A free-text search term used to filter pipelines."),
        visibility: s.nonEmptyString("The visibility filter value used to filter pipelines."),
        attributes: s.array("Additional pipeline attributes to include in the response.", pipelineAttributeSchema),
      },
      [],
      "Input parameters for listing Seqera pipelines.",
    ),
    outputSchema: s.object(
      "The Seqera pipeline list response.",
      {
        pipelines: s.array("The pipelines returned by Seqera.", pipelineSchema),
        totalSize: s.integer("The total number of pipelines available for the current query."),
      },
      { required: ["pipelines"], optional: ["totalSize"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_pipeline",
    description: "Retrieve one Seqera pipeline by pipeline ID.",
    inputSchema: s.actionInput(
      {
        pipelineId: pipelineIdField,
        workspaceId: workspaceIdField,
        sourceWorkspaceId: sourceWorkspaceIdField,
        attributes: s.array("Additional pipeline attributes to include in the response.", pipelineAttributeSchema),
      },
      ["pipelineId"],
      "Input parameters for retrieving a Seqera pipeline.",
    ),
    outputSchema: s.actionOutput({ pipeline: pipelineSchema }, "The Seqera pipeline detail response."),
  }),
  defineProviderAction(service, {
    name: "list_workflows",
    description: "List Seqera workflow runs in the current user context or a specific workspace.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdField,
        max: maxField,
        offset: offsetField,
        search: s.nonEmptyString("A free-text search term used to filter workflows."),
        includeTotalSize: s.boolean("Whether Seqera should include the total workflow count in the response."),
        attributes: s.array("Additional workflow attributes to include in the response.", workflowAttributeSchema),
      },
      [],
      "Input parameters for listing Seqera workflows.",
    ),
    outputSchema: s.object(
      "The Seqera workflow list response.",
      {
        workflows: s.array("The workflows returned by Seqera.", workflowListElementSchema),
        totalSize: s.integer("The total number of workflows available for the current query."),
        hasMore: s.boolean("Whether more workflows remain beyond the current response window."),
      },
      { required: ["workflows"], optional: ["totalSize", "hasMore"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    description: "Retrieve one Seqera workflow run by workflow ID.",
    inputSchema: s.actionInput(
      {
        workflowId: workflowIdField,
        workspaceId: workspaceIdField,
        attributes: s.array("Additional workflow attributes to include in the response.", workflowAttributeSchema),
      },
      ["workflowId"],
      "Input parameters for retrieving a Seqera workflow.",
    ),
    outputSchema: s.object(
      "The Seqera workflow detail response.",
      {
        workflow: workflowSchema,
        progress: progressDataSchema,
        pipelineInfo: pipelineInfoSchema,
        labels: s.array("The workflow labels returned by Seqera, when available.", labelSchema),
        messages: s.stringArray("Informational messages returned by Seqera for the workflow.", {
          itemDescription: "One informational message returned by Seqera.",
        }),
        optimized: s.boolean("Whether Seqera marked the workflow as optimized."),
        orgId: orgIdField,
        orgName: s.string("The organization name associated with the workflow."),
        workspaceId: workspaceIdField,
        workspaceName: s.string("The workspace name associated with the workflow."),
        jobInfo: jobInfoSchema,
        platform: platformSchema,
      },
      {
        required: ["workflow"],
        optional: [
          "progress",
          "pipelineInfo",
          "labels",
          "messages",
          "optimized",
          "orgId",
          "orgName",
          "workspaceId",
          "workspaceName",
          "jobInfo",
          "platform",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "launch_workflow",
    description: "Launch a Seqera workflow from a pipeline repository or registered pipeline.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdField,
        sourceWorkspaceId: sourceWorkspaceIdField,
        pipeline: s.nonEmptyString("The pipeline repository name or URL to launch."),
        computeEnvId: s.nonEmptyString("The compute environment ID used for the launch."),
        workDir: s.nonEmptyString("The work directory configured for the workflow launch."),
        revision: s.nonEmptyString("The Git revision used for the workflow launch."),
        runName: s.nonEmptyString("The run name assigned to the workflow launch."),
        configProfiles: s.stringArray("The Nextflow config profiles applied to the launch.", {
          itemDescription: "One Nextflow config profile name.",
        }),
        paramsText: s.nonEmptyString("The workflow parameters payload encoded as text."),
        configText: s.nonEmptyString("Additional Nextflow config text applied to the launch."),
        mainScript: s.nonEmptyString("The alternative main script path used for the launch."),
        entryName: s.nonEmptyString("The Nextflow entry workflow name used for the launch."),
        pullLatest: s.boolean("Whether Seqera should pull the latest pipeline revision before launching."),
        resume: s.boolean("Whether Seqera should resume a compatible previous workflow execution."),
        stubRun: s.boolean("Whether the workflow should run in Nextflow stub mode."),
        userSecrets: s.stringArray("The user secret names attached to the launch.", {
          itemDescription: "One user secret name referenced by the launch.",
        }),
        workspaceSecrets: s.stringArray("The workspace secret names attached to the launch.", {
          itemDescription: "One workspace secret name referenced by the launch.",
        }),
      },
      ["pipeline"],
      "Input parameters for launching a Seqera workflow.",
    ),
    outputSchema: s.actionOutput(
      {
        workflowId: s.nonEmptyString("The workflow ID created by the Seqera launch request."),
      },
      "The Seqera workflow launch response.",
    ),
  }),
];
