import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { postmanGeneratedActionSchemas } from "./generated.ts";

const service = "postman";

export type PostmanActionName = (typeof postmanGeneratedActionSchemas)[number]["name"];

export const postmanActions: ActionDefinition[] = postmanGeneratedActionSchemas.map((actionSchema) =>
  defineProviderAction(service, {
    name: actionSchema.name,
    operationType: actionSchema.operationType,
    description: actionSchema.description,
    requiredScopes: [],
    providerPermissions: [],
    inputSchema: actionSchema.inputSchema as JsonSchema,
    outputSchema: actionSchema.outputSchema as JsonSchema,
  }),
);
