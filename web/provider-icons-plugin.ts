import type { Plugin } from "vite";

const catalogUrl = "https://connector.oomol.com/public/v1/apps";
const publicModuleId = "virtual:oomol-provider-icons";
const resolvedModuleId = `\0${publicModuleId}`;

interface CatalogItem {
  iconUrl?: unknown;
  service?: unknown;
}

interface CatalogPayload {
  data?: unknown;
}

interface ProviderIconsPluginOptions {
  iconUrls?: Readonly<Record<string, string>>;
}

/** Bundles OOMOL's provider icon mapping and caches it for the lifetime of the Vite process. */
export function providerIconsPlugin(options: ProviderIconsPluginOptions = {}): Plugin {
  let cachedModule: Promise<string> | undefined;

  return {
    name: "oomol-provider-icons",
    resolveId(id): string | undefined {
      return id === publicModuleId ? resolvedModuleId : undefined;
    },
    load(id): Promise<string> | undefined {
      if (id !== resolvedModuleId) {
        return undefined;
      }
      cachedModule ??= options.iconUrls
        ? Promise.resolve(serializeProviderIcons(options.iconUrls))
        : loadProviderIconsModule().catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            this.warn(`Provider icon catalog unavailable: ${reason}. Using default provider icons.`);
            return serializeProviderIcons({});
          });
      return cachedModule;
    },
  };
}

async function loadProviderIconsModule(): Promise<string> {
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`Could not load OOMOL provider icons: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as CatalogPayload;
  if (!Array.isArray(payload.data)) {
    throw new Error("Could not load OOMOL provider icons: catalog.data is not an array");
  }

  const iconUrls: Record<string, string> = {};
  for (const item of payload.data as CatalogItem[]) {
    if (typeof item.service === "string" && typeof item.iconUrl === "string" && item.iconUrl.trim()) {
      iconUrls[item.service] = item.iconUrl;
    }
  }

  return serializeProviderIcons(iconUrls);
}

function serializeProviderIcons(iconUrls: Readonly<Record<string, string>>): string {
  return `export default ${JSON.stringify(iconUrls)};`;
}
