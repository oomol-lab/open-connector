import type { ActionDefinition, JsonSchema } from "./types.ts";

/**
 * Input for defining one provider action without repeating provider-level
 * fields in every action object.
 */
export interface DefineProviderActionInput<TName extends string = string> {
  name: TName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredScopes?: readonly string[];
  providerPermissions?: readonly string[];
  followUpActions?: readonly string[];
  asyncLifecycle?: ActionDefinition["asyncLifecycle"];
}

export type ProviderActionDefinition<TName extends string = string> = ActionDefinition & { name: TName };

/**
 * Create a full action definition for one provider.
 *
 * Provider modules use this helper so definitions read as business action
 * declarations instead of generated catalog JSON.
 */
export function defineProviderAction<const TName extends string>(
  service: string,
  input: DefineProviderActionInput<TName>,
): ProviderActionDefinition<TName> {
  return {
    id: `${service}.${input.name}`,
    service,
    name: input.name,
    description: input.description,
    requiredScopes: input.requiredScopes ? [...input.requiredScopes] : [],
    providerPermissions: input.providerPermissions ? [...input.providerPermissions] : [],
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    followUpActions: input.followUpActions ? [...input.followUpActions] : undefined,
    asyncLifecycle: input.asyncLifecycle,
  };
}
