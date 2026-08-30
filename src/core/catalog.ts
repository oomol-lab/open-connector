import type { ProviderDefinition } from "./types.ts";

/**
 * Return providers in stable catalog order and sort each provider's actions.
 */
export function sortProviders(providers: ProviderDefinition[]): ProviderDefinition[] {
  return [...providers]
    .sort((a, b) => a.service.localeCompare(b.service))
    .map((provider) => ({
      ...provider,
      actions: [...provider.actions].sort((a, b) => a.id.localeCompare(b.id)),
    }));
}
