import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coolify";

const uuidSchema = s.nonWhitespaceString("The Coolify resource UUID.");
const applicationSchema = s.looseObject("A Coolify application.", {
  id: s.integer("The application database ID."),
  uuid: uuidSchema,
  name: s.string("The application name."),
  description: s.nullableString("The application description."),
  status: s.string("The current application status."),
  fqdn: s.nullableString("The application domains."),
  git_repository: s.string("The source Git repository."),
  git_branch: s.string("The deployed Git branch."),
  created_at: s.dateTime("When the application was created."),
  updated_at: s.dateTime("When the application was last updated."),
});
const deploymentSchema = s.looseObject("A Coolify deployment.", {
  id: s.integer("The deployment database ID."),
  deployment_uuid: s.string("The deployment UUID."),
  application_id: s.string("The deployed application ID."),
  application_name: s.string("The deployed application name."),
  status: s.string("The current deployment status."),
  commit: s.string("The deployed commit SHA."),
  commit_message: s.string("The deployed commit message."),
  created_at: s.string("When the deployment was created."),
  updated_at: s.string("When the deployment was last updated."),
  deployment_url: s.string("The Coolify deployment URL."),
});
const messageSchema = s.looseObject("The queued operation result.", {
  message: s.string("The result message."),
  deployment_uuid: s.string("The queued deployment UUID, when one was created."),
});
const emptyInput = s.object({}, { additionalProperties: false });
const applicationInput = s.object({ uuid: uuidSchema });

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, { name, description, inputSchema, outputSchema });
}

export const coolifyActions: ActionDefinition[] = [
  action(
    "list_applications",
    "List applications available to the connected Coolify team.",
    s.object({ tag: s.optional(s.string("Only include applications with this tag.")) }),
    s.object({ applications: s.array("The matching Coolify applications.", applicationSchema) }),
  ),
  action(
    "get_application",
    "Get one Coolify application by UUID.",
    applicationInput,
    s.object({ application: applicationSchema }),
  ),
  action(
    "get_application_logs",
    "Get recent logs for a Coolify application.",
    s.object({
      uuid: uuidSchema,
      lines: s.optional(s.positiveInteger("The number of lines to return.", { default: 100 })),
      showTimestamps: s.optional(
        s.boolean({ description: "Whether each log line should include its timestamp.", default: false }),
      ),
    }),
    s.object({ logs: s.string("The application log output.") }),
  ),
  action(
    "start_application",
    "Start a Coolify application and queue its deployment.",
    s.object({
      uuid: uuidSchema,
      force: s.optional(
        s.boolean({ description: "Whether to rebuild the application without cache.", default: false }),
      ),
      instantDeploy: s.optional(s.boolean({ description: "Whether to skip the deployment queue.", default: false })),
    }),
    messageSchema,
  ),
  action(
    "stop_application",
    "Stop a Coolify application.",
    s.object({
      uuid: uuidSchema,
      dockerCleanup: s.optional(
        s.boolean({ description: "Whether to prune related Docker networks and volumes.", default: true }),
      ),
    }),
    messageSchema,
  ),
  action("restart_application", "Restart a Coolify application.", applicationInput, messageSchema),
  action(
    "list_deployments",
    "List deployments currently running in Coolify.",
    emptyInput,
    s.object({ deployments: s.array("The running Coolify deployments.", deploymentSchema) }),
  ),
  action(
    "get_deployment",
    "Get a Coolify deployment by UUID.",
    s.object({ uuid: s.nonWhitespaceString("The Coolify deployment UUID.") }),
    s.object({ deployment: deploymentSchema }),
  ),
  action(
    "deploy_resource",
    "Queue a deployment for one Coolify resource UUID.",
    s.object({
      uuid: uuidSchema,
      force: s.optional(s.boolean({ description: "Whether to rebuild the resource without cache.", default: false })),
    }),
    s.looseObject("The Coolify deployment request result.", {
      deployments: s.array("The deployments queued by Coolify.", messageSchema),
    }),
  ),
];
