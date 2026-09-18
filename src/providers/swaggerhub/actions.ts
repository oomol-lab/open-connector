import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "swaggerhub";

export type SwaggerHubActionName =
  | "search_registry_specs"
  | "search_apis"
  | "list_owner_apis"
  | "list_api_versions"
  | "get_api_definition"
  | "search_domains"
  | "list_owner_domains"
  | "list_domain_versions"
  | "get_domain_definition"
  | "list_templates"
  | "list_template_versions"
  | "get_template_definition"
  | "list_projects"
  | "get_project";

function action(
  name: SwaggerHubActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    inputSchema: s.looseObject(`Input parameters for ${name}.`),
    outputSchema: s.looseObject(`SwaggerHub response for ${name}.`),
  });
}

export const swaggerhubActions: ActionDefinition[] = [
  action("search_registry_specs", "read", "Search SwaggerHub registry specs."),
  action("search_apis", "read", "Search SwaggerHub APIs."),
  action("list_owner_apis", "read", "List APIs for a SwaggerHub owner."),
  action("list_api_versions", "read", "List versions for a SwaggerHub API."),
  action("get_api_definition", "read", "Get a SwaggerHub API definition as JSON or YAML."),
  action("search_domains", "read", "Search SwaggerHub domains."),
  action("list_owner_domains", "read", "List domains for a SwaggerHub owner."),
  action("list_domain_versions", "read", "List versions for a SwaggerHub domain."),
  action("get_domain_definition", "read", "Get a SwaggerHub domain definition as JSON or YAML."),
  action("list_templates", "read", "List SwaggerHub templates."),
  action("list_template_versions", "read", "List versions for a SwaggerHub template."),
  action("get_template_definition", "read", "Get a SwaggerHub template definition as JSON or YAML."),
  action("list_projects", "read", "List SwaggerHub projects for an owner."),
  action("get_project", "read", "Get a SwaggerHub project."),
];
