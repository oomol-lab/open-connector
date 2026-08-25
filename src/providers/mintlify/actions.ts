import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mintlify";

const deploymentRequestOutputSchema = s.object("A queued Mintlify deployment request.", {
  statusId: s.string("The status ID used to track the deployment."),
});

const deploymentStatusOutputSchema = s.looseRequiredObject(
  "The current status and available details for a Mintlify deployment.",
  {
    status: s.stringEnum("The current deployment state.", ["queued", "in_progress", "success", "failure"]),
    _id: s.string("The deployment status ID."),
    projectId: s.string("The Mintlify project ID."),
    createdAt: s.string("The UTC timestamp when the deployment was created."),
    endedAt: s.string("The UTC timestamp when the deployment ended."),
    summary: s.string("A summary of the deployment status."),
    logs: s.array("The deployment log messages.", s.string("One deployment log message.")),
    subdomain: s.string("The subdomain of the documentation site."),
  },
  { optional: ["_id", "projectId", "createdAt", "endedAt", "summary", "logs", "subdomain"] },
);

export const mintlifyActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "trigger_deployment",
    description: "Queue a production deployment for a Mintlify documentation project.",
    requiredScopes: [],
    asyncLifecycle: { startActionId: "mintlify.trigger_deployment", statusActionId: "mintlify.get_deployment_status" },
    inputSchema: s.object("The Mintlify project to deploy.", {
      projectId: s.string("The Mintlify project ID copied from the organization API keys page."),
    }),
    outputSchema: deploymentRequestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "trigger_preview_deployment",
    description: "Create or redeploy a Mintlify preview for a specific Git branch.",
    requiredScopes: [],
    asyncLifecycle: {
      startActionId: "mintlify.trigger_preview_deployment",
      statusActionId: "mintlify.get_deployment_status",
    },
    inputSchema: s.object("The Mintlify project and Git branch to preview.", {
      projectId: s.string("The Mintlify project ID copied from the organization API keys page."),
      branch: s.string("The non-empty Git branch name to deploy as a preview.", { minLength: 1 }),
    }),
    outputSchema: s.object("A queued Mintlify preview deployment.", {
      statusId: s.string("The status ID used to track the preview deployment."),
      previewUrl: s.string("The URL where the preview deployment is hosted.", { format: "uri" }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_deployment_status",
    description: "Get the current status and details of a Mintlify deployment.",
    requiredScopes: [],
    inputSchema: s.object("The Mintlify deployment status to retrieve.", {
      statusId: s.string("The status ID returned when a deployment was queued."),
    }),
    outputSchema: deploymentStatusOutputSchema,
  }),
];
