/**
 * Return providers in stable catalog order and sort each provider's actions.
 */
export function sortProviders<T extends { service: string; actions: readonly { id: string }[] }>(providers: T[]): T[] {
  return [...providers]
    .sort((a, b) => a.service.localeCompare(b.service))
    .map((provider) => ({
      ...provider,
      actions: [...provider.actions].sort((a, b) => a.id.localeCompare(b.id)),
    }));
}
