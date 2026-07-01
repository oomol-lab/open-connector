import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { groqcloudGeneratedActionSchemas } from "./generated.ts";

const service = "groqcloud";

export type GroqcloudActionName = (typeof groqcloudGeneratedActionSchemas)[number]["name"];

export const groqcloudActions: ActionDefinition[] = groqcloudGeneratedActionSchemas.map((actionSchema) =>
  defineProviderAction(service, {
    name: actionSchema.name,
    description: actionSchema.description,
    requiredScopes: actionSchema.requiredScopes,
    providerPermissions: actionSchema.providerPermissions,
    followUpActions: actionSchema.followUpActions,
    asyncLifecycle: actionSchema.asyncLifecycle,
    inputSchema: actionSchema.inputSchema as JsonSchema,
    outputSchema: actionSchema.outputSchema as JsonSchema,
  }),
);
