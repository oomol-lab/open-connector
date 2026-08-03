import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { komariOperations } from "./operations.ts";

const service = "komari";

export const komariActions: ProviderActionDefinition[] = komariOperations.map((operation) =>
  defineProviderAction(service, {
    name: operation.name,
    description: operation.description,
    requiredScopes: [operation.rpcMethod],
    inputSchema: operation.inputSchema,
    outputSchema: operation.outputSchema,
  }),
);
