export interface DefaultMarketplaceDiscovery {
  name: string;
  actions: string[];
}

/** Reads the public browsing catalog without sending credentials or activating a connection. */
export async function loadDefaultMarketplaceCatalog(
  url: string,
  signal: AbortSignal,
): Promise<DefaultMarketplaceDiscovery> {
  const response = await fetch(url, {
    credentials: "omit",
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
