import type { ActionDefinition } from "../../core/types.ts";

import { defineProviderAction } from "../../core/provider-definition.ts";
import { tailscaleOperations } from "./operations.ts";

const service = "tailscale";

export const tailscaleActions: ActionDefinition[] = tailscaleOperations.map((operation) =>
  defineProviderAction(service, {
    name: operation.name,
    description: operation.description,
    requiredScopes: [...operation.requiredScopes],
    providerPermissions: [...operation.requiredScopes],
    inputSchema: operation.inputSchema,
    outputSchema: operation.outputSchema,
  }),
);
