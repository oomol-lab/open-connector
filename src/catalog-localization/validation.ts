import type { CatalogProviderMetadata } from "../catalog-store.ts";
import type { CatalogTranslation, DisplayText } from "./types.ts";

import { zhCN } from "./zh-CN.ts";

/** Validate stable translation references before publishing a generated catalog. */
export function validateCatalogTranslations(
  providers: readonly CatalogProviderMetadata[],
  translation: CatalogTranslation = zhCN,
): void {
  const byService = new Map(providers.map((provider) => [provider.service, provider]));
  const categories = new Set(providers.flatMap((provider) => provider.categories));
  for (const category of Object.keys(translation.categories)) {
    if (!categories.has(category)) throw new Error(`Unknown translated category: ${category}`);
  }
  for (const [service, text] of Object.entries(translation.providers)) {
    const provider = byService.get(service);
    if (!provider) throw new Error(`Unknown translated provider: ${service}`);
    for (const type of Object.keys(text.auth ?? {})) {
      if (!provider.auth.some((auth) => auth.type === type))
        throw new Error(`Unknown translated auth: ${service}.${type}`);
    }
    for (const auth of provider.auth) {
      let fields: Record<string, DisplayText> | undefined;
      let keys: string[] = [];
      switch (auth.type) {
        case "no_auth":
          continue;
        case "api_key":
          fields = text.auth?.api_key?.fields;
          keys = (auth.extraFields ?? []).map((field) => field.key);
          break;
        case "custom_credential":
          fields = text.auth?.custom_credential?.fields;
          keys = auth.fields.map((field) => field.key);
          break;
        case "oauth2": {
          const translated = text.auth?.oauth2;
          fields = translated?.fields;
          keys = (auth.clientConfigFields ?? []).map((field) => field.key);
          if (translated?.steps && translated.steps.length !== auth.clientSetup?.steps.length)
            throw new Error(`Translated setup steps do not match: ${service}`);
          for (const id of Object.keys(translated?.authorizationOptions ?? {})) {
            if (!auth.authorizationOptions?.some((option) => option.id === id))
              throw new Error(`Unknown translated authorization option: ${service}.${id}`);
          }
          break;
        }
      }
      for (const key of Object.keys(fields ?? {})) {
        if (!keys.includes(key)) throw new Error(`Unknown translated credential field: ${service}.${auth.type}.${key}`);
      }
    }
  }
}

/** Lists providers without provider-specific Chinese text; shared labels and category translations are separate. */
export function untranslatedProviderServices(providers: readonly CatalogProviderMetadata[]): string[] {
  return providers.filter((provider) => !zhCN.providers[provider.service]).map((provider) => provider.service);
}
