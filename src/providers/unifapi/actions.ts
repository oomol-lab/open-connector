import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { unifapiOperations } from "./operations.ts";

const service = "unifapi";

export const unifapiActions: ProviderActionDefinition[] = unifapiOperations.map((operation) =>
  defineProviderAction(service, {
    name: operation.name,
    description: operation.description,
    inputSchema: operation.inputSchema,
    outputSchema: operation.outputSchema,
  }),
);

export type UnifapiActionName = string;
