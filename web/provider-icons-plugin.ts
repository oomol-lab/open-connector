import type { Plugin } from "vite";

import { readFile } from "node:fs/promises";

const publicModuleId = "virtual:oomol-provider-icons";
const resolvedModuleId = `\0${publicModuleId}`;

interface ProviderIconsPluginOptions {
  iconUrls?: Readonly<Record<string, string>>;
}

/** Bundles a verified provider icon snapshot without requiring network access at build time. */
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
  const snapshot = await readFile(new URL("./provider-icons.snapshot.json", import.meta.url), "utf8");
  return serializeProviderIcons(JSON.parse(snapshot) as Record<string, string>);
}

function serializeProviderIcons(iconUrls: Readonly<Record<string, string>>): string {
  return `export default ${JSON.stringify(iconUrls)};`;
}
