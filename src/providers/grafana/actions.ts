import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { grafanaGeneratedActionSchemas } from "./generated.ts";

const service = "grafana";

export type GrafanaActionName = (typeof grafanaGeneratedActionSchemas)[number]["name"];

export const grafanaActions: ActionDefinition[] = grafanaGeneratedActionSchemas.map((actionSchema) =>
  defineProviderAction(service, {
    name: actionSchema.name,
    description: actionSchema.description,
    requiredScopes: actionSchema.requiredScopes,
    providerPermissions: actionSchema.providerPermissions,
    inputSchema: actionSchema.inputSchema as JsonSchema,
    outputSchema: actionSchema.outputSchema as JsonSchema,
  }),
);
