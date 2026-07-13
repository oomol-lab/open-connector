import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { dokployOperations } from "./operations.ts";

export type { DokployActionName } from "./operations.ts";

const service = "dokploy";

export const dokployActions: ProviderActionDefinition[] = dokployOperations.map((operation) =>
  defineProviderAction(service, {
    name: operation.name,
    description: operation.description,
    inputSchema: operation.inputSchema,
    outputSchema: operation.outputSchema,
  }),
);
