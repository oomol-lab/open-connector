import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "render";

const looseObjectSchema = s.looseObject("Object returned by Render.");
const dateTimeField = s.string("Timestamp in ISO 8601 format.");
const cursorField = s.nonEmptyString("Pagination cursor returned by a previous Render response.");
const limitField = s.integer({ minimum: 1, maximum: 100, description: "Maximum number of results to return." });
const serviceIdField = s.nonEmptyString("The unique identifier of the Render service.");
const deployIdField = s.nonEmptyString("The unique identifier of the Render deploy.");
const nameFilterField = s.stringArray("Only return resources with one of these exact names.", { minItems: 1 });
const emailFilterField = s.array(
  "Only return workspaces owned by one of these email addresses.",
  s.email("Workspace owner email."),
  { minItems: 1 },
);
const ownerIdFilterField = s.stringArray("Only return resources for one of these workspace IDs.", { minItems: 1 });
const includePreviewsField = s.boolean("Whether preview services should be included in the response.");
const serviceTypeSchema = s.stringEnum("Type of service on Render.", [
  "static_site",
  "web_service",
  "private_service",
  "background_worker",
  "cron_job",
]);
const suspendedStateSchema = s.stringEnum("Suspension state reported by Render.", ["suspended", "not_suspended"]);
const suspenderSchema = s.stringEnum("Reason why the service is suspended.", [
  "admin",
  "billing",
  "user",
  "parent_service",
  "stuck_crashlooping",
  "hipaa_enablement",
  "unknown",
]);
const autoDeploySchema = s.stringEnum("Whether Render auto-deploys changes for the service.", ["yes", "no"]);
const notifyOnFailSchema = s.stringEnum("Notification setting when a deploy fails.", ["default", "notify", "ignore"]);
const deployStatusSchema = s.stringEnum("Deploy status reported by Render.", [
  "created",
  "queued",
  "build_in_progress",
  "update_in_progress",
  "live",
  "deactivated",
  "build_failed",
  "update_failed",
  "canceled",
  "pre_deploy_in_progress",
  "pre_deploy_failed",
]);
const deployModeSchema = s.stringEnum("Deployment behavior to use when triggering a deploy.", [
  "deploy_only",
  "build_and_deploy",
]);

const userSchema = s.object(
  {
    email: s.email("Email address of the authenticated Render user."),
    name: s.string("Display name of the authenticated Render user."),
  },
  { description: "Render user." },
);
const ownerSchema = s.looseObject(
  {
    id: s.string("Unique identifier of the workspace."),
    name: s.string("Workspace display name."),
    email: s.email("Primary email address of the workspace."),
    type: s.stringEnum("Workspace type.", ["user", "team"]),
    ipAllowList: s.array("IP allow list entries configured for the workspace, when present.", looseObjectSchema),
    twoFactorAuthEnabled: s.boolean("Whether two-factor authentication is enabled for the workspace owner."),
  },
  { description: "Render workspace." },
);
const serviceSchema = s.looseObject(
  {
    id: s.string("Unique identifier of the service."),
    name: s.string("Name of the service."),
    ownerId: s.string("Workspace ID that owns the service."),
    type: serviceTypeSchema,
    createdAt: dateTimeField,
    dashboardUrl: s.string("Dashboard URL for the service."),
    updatedAt: dateTimeField,
    suspended: suspendedStateSchema,
    suspenders: s.array("Suspension reasons reported for the service.", suspenderSchema),
    autoDeploy: autoDeploySchema,
    notifyOnFail: notifyOnFailSchema,
    slug: s.string("URL-friendly slug of the service."),
    serviceDetails: looseObjectSchema,
    rootDir: s.string("Repository root directory configured for the service."),
    branch: s.string("Git branch used by the service, when present."),
    buildFilter: looseObjectSchema,
    environmentId: s.string("Environment ID attached to the service, when present."),
    imagePath: s.string("Docker image path used by the service, when present."),
    registryCredential: looseObjectSchema,
    repo: s.string("Source repository URL for the service, when present."),
  },
  { description: "Render service." },
);
const deploySchema = s.looseObject(
  {
    id: s.string("Unique identifier of the deploy."),
    commit: looseObjectSchema,
    image: looseObjectSchema,
    status: deployStatusSchema,
    trigger: s.string("Event that triggered the deploy."),
    startedAt: dateTimeField,
    finishedAt: dateTimeField,
    createdAt: dateTimeField,
    updatedAt: dateTimeField,
  },
  { description: "Render deploy." },
);
const queuedDeploySchema = s.object(
  {
    queued: s.boolean("Whether the deploy request was accepted and queued."),
    serviceId: serviceIdField,
  },
  { description: "Acknowledgement for a queued Render deploy request." },
);
const lifecycleAckSchema = s.object(
  {
    ok: s.boolean("Whether the lifecycle operation request was accepted."),
    serviceId: serviceIdField,
    action: s.stringEnum("Lifecycle action requested.", ["restart", "suspend", "resume"]),
  },
  { description: "Acknowledgement for a Render lifecycle operation." },
);
const listWorkspacesOutputSchema = s.object(
  {
    workspaces: s.array("Workspaces returned by Render.", ownerSchema),
    nextCursor: s.nullableString("Cursor for the next page of workspaces, or null when there is no next page."),
  },
  { description: "Paginated Render workspace list." },
);
const listServicesOutputSchema = s.object(
  {
    services: s.array("Services returned by Render.", serviceSchema),
    nextCursor: s.nullableString("Cursor for the next page of services, or null when there is no next page."),
  },
  { description: "Paginated Render service list." },
);
const listDeploysOutputSchema = s.object(
  {
    deploys: s.array("Deploys returned by Render.", deploySchema),
    nextCursor: s.nullableString("Cursor for the next page of deploys, or null when there is no next page."),
  },
  { description: "Paginated Render deploy list." },
);

function optionalInput(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return s.object(properties, { optional: Object.keys(properties), description });
}

const triggerDeployInputSchema = s.object(
  {
    serviceId: serviceIdField,
    clearCache: s.boolean("Whether Render should clear the build cache before deploying."),
    commitId: s.nonEmptyString("Specific Git commit SHA to deploy instead of the latest commit."),
    imageUrl: s.nonEmptyString("Image URL to deploy for an image-backed service."),
    deployMode: deployModeSchema,
  },
  {
    optional: ["clearCache", "commitId", "imageUrl", "deployMode"],
    description:
      "Input for triggering a Render deploy. deployMode cannot be combined with commitId, imageUrl, or clearCache.",
  },
);

export const renderActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the currently authenticated Render user profile.",
    inputSchema: s.object({}, { description: "Action input." }),
    outputSchema: userSchema,
    followUpActions: ["render.list_workspaces"],
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    operationType: "read",
    description: "List Render workspaces available to the authenticated API key.",
    inputSchema: optionalInput({
      name: nameFilterField,
      email: emailFilterField,
      cursor: cursorField,
      limit: limitField,
    }),
    outputSchema: listWorkspacesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_services",
    operationType: "read",
    description: "List Render services with optional workspace, type, and suspension filters.",
    inputSchema: optionalInput({
      name: nameFilterField,
      type: s.array("Only return services with these types.", serviceTypeSchema, { minItems: 1 }),
      ownerId: ownerIdFilterField,
      suspended: s.array("Only return services in one of these suspension states.", suspendedStateSchema, {
        minItems: 1,
      }),
      includePreviews: includePreviewsField,
      cursor: cursorField,
      limit: limitField,
    }),
    outputSchema: listServicesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_service",
    operationType: "read",
    description: "Get Render service details by service ID.",
    inputSchema: s.object({ serviceId: serviceIdField }),
    outputSchema: serviceSchema,
    followUpActions: [
      "render.list_deploys",
      "render.restart_service",
      "render.suspend_service",
      "render.resume_service",
    ],
  }),
  defineProviderAction(service, {
    name: "list_deploys",
    operationType: "read",
    description: "List recent Render deploys for a service.",
    inputSchema: s.object(
      {
        serviceId: serviceIdField,
        status: s.array("Only return deploys with these statuses.", deployStatusSchema, { minItems: 1 }),
        cursor: cursorField,
        limit: limitField,
      },
      { optional: ["status", "cursor", "limit"] },
    ),
    outputSchema: listDeploysOutputSchema,
  }),
  defineProviderAction(service, {
    name: "trigger_deploy",
    operationType: "write",
    description: "Trigger a new deploy for a Render service.",
    inputSchema: triggerDeployInputSchema,
    outputSchema: s.union([deploySchema, queuedDeploySchema]),
  }),
  defineProviderAction(service, {
    name: "rollback_deploy",
    operationType: "destructive",
    description: "Trigger a rollback to a previous deploy for a Render service.",
    inputSchema: s.object({ serviceId: serviceIdField, deployId: deployIdField }),
    outputSchema: deploySchema,
  }),
  defineProviderAction(service, {
    name: "restart_service",
    operationType: "write",
    description: "Restart a Render service.",
    inputSchema: s.object({ serviceId: serviceIdField }),
    outputSchema: lifecycleAckSchema,
  }),
  defineProviderAction(service, {
    name: "suspend_service",
    operationType: "destructive",
    description: "Suspend a Render service.",
    inputSchema: s.object({ serviceId: serviceIdField }),
    outputSchema: lifecycleAckSchema,
  }),
  defineProviderAction(service, {
    name: "resume_service",
    operationType: "write",
    description: "Resume a suspended Render service.",
    inputSchema: s.object({ serviceId: serviceIdField }),
    outputSchema: lifecycleAckSchema,
  }),
];
