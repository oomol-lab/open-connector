export const defaultMarketplaceDiscoveryUrl = "https://connector.oomol.com/.well-known/oomol-connector-marketplace";

/** Identifies the default source by URL, never by a remote name or provider ID. */
export function isDefaultMarketplace(discoveryUrl: string): boolean {
  try {
    const url = new URL(discoveryUrl.trim());
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.href.replace(/\/$/, "") === defaultMarketplaceDiscoveryUrl
    );
  } catch {
    return false;
  }
}
