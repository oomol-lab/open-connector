import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "doppler";

const inputSchema = s.looseObject("Doppler action input.");
const outputSchema = s.looseObject("Doppler action output.");

const dopplerActionNames = [
  ["get_auth_me", "Get metadata for the current Doppler token.", "read"],
  ["list_projects", "List Doppler projects.", "read"],
  ["get_project", "Get a Doppler project.", "read"],
  ["create_project", "Create a Doppler project.", "write"],
  ["update_project", "Update a Doppler project.", "write"],
  ["delete_project", "Delete a Doppler project.", "destructive"],
  ["list_environments", "List Doppler environments.", "read"],
  ["get_environment", "Get a Doppler environment.", "read"],
  ["create_environment", "Create a Doppler environment.", "write"],
  ["update_environment", "Update a Doppler environment.", "write"],
  ["delete_environment", "Delete a Doppler environment.", "destructive"],
  ["list_configs", "List Doppler configs.", "read"],
  ["get_config", "Get a Doppler config.", "read"],
  ["create_config", "Create a Doppler config.", "write"],
  ["update_config", "Update a Doppler config.", "write"],
  ["delete_config", "Delete a Doppler config.", "destructive"],
  ["clone_config", "Clone a Doppler config.", "write"],
  ["set_config_inheritable", "Set whether a Doppler config can be inherited.", "write"],
  ["list_secrets", "List Doppler secrets.", "read"],
  ["list_secret_names", "List Doppler secret names.", "read"],
  ["get_secret", "Get a Doppler secret.", "read"],
  ["download_secrets", "Download Doppler secrets.", "read"],
  ["update_secrets", "Update Doppler secrets.", "destructive"],
  ["delete_secret", "Delete a Doppler secret.", "destructive"],
  ["update_secret_note", "Update a Doppler secret note.", "write"],
  ["issue_dynamic_secret_lease", "Issue a Doppler dynamic secret lease.", "write"],
  ["revoke_dynamic_secret_lease", "Revoke a Doppler dynamic secret lease.", "destructive"],
  ["list_config_logs", "List Doppler config change logs.", "read"],
  ["get_config_log", "Get a Doppler config change log.", "read"],
  ["list_service_tokens", "List Doppler service tokens.", "read"],
  ["create_service_token", "Create a Doppler service token.", "write"],
  ["delete_service_token", "Delete a Doppler service token.", "destructive"],
  ["list_integrations", "List Doppler integrations.", "read"],
  ["get_integration", "Get a Doppler integration.", "read"],
  ["get_sync", "Get a Doppler sync.", "read"],
  ["create_sync", "Create a Doppler sync.", "write"],
  ["delete_sync", "Delete a Doppler sync.", "destructive"],
  ["list_change_requests", "List Doppler change requests.", "read"],
  ["create_change_request", "Create a Doppler change request.", "write"],
  ["get_change_request", "Get a Doppler change request.", "read"],
  ["update_change_request", "Update a Doppler change request.", "write"],
  ["update_change_request_assignees", "Update Doppler change request assignees.", "destructive"],
  ["update_change_request_unit_status", "Update a Doppler change request unit status.", "destructive"],
  ["review_change_request_unit", "Review a Doppler change request unit.", "write"],
] as const;

export const dopplerActions: ActionDefinition[] = dopplerActionNames.map(([name, description, operationType]) =>
  defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema,
    outputSchema,
  }),
);
