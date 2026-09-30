export interface TriggerPermission {
  id: string;
  name: string;
  description: string;
  providerPermissions: readonly string[];
  instructions?: string;
  providerScopeAlternatives?: readonly string[];
}
