export interface DefaultMarketplaceDiscovery {
  name: string;
  actions: string[];
}

/** Reads the public browsing catalog through the runtime so browser CORS policy cannot block it. */
export async function loadDefaultMarketplaceCatalog(signal: AbortSignal): Promise<DefaultMarketplaceDiscovery> {
  const response = await fetch("/api/marketplace/discovery", {
    credentials: "same-origin",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Default Marketplace returned HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !("actions" in value) ||
    !Array.isArray(value.actions) ||
    !value.actions.every((action: unknown) => typeof action === "string")
  ) {
    throw new Error("Default Marketplace returned an invalid discovery document.");
  }
  return { name: value.name, actions: value.actions };
}
