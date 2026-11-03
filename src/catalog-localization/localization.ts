import type { CatalogProviderMetadata } from "../catalog-store.ts";
import type { ProviderSetupLabels } from "../core/provider-setup.ts";
import type { CredentialDefinition, ProviderAuthDefinition } from "../core/types.ts";
import type { DisplayText } from "./types.ts";

import { zhCN } from "./zh-CN.ts";

export type CatalogLocale = "en" | "zh-CN";

export const catalogSetupLabels: Record<CatalogLocale, ProviderSetupLabels | undefined> = {
  en: undefined,
  "zh-CN": zhCN.labels,
};

function matchLocale(value: string): CatalogLocale | undefined {
  const parts = value.trim().toLowerCase().split("-");
  if (parts[0] === "en" || value === "*") return "en";
  if (parts[0] !== "zh") return undefined;
  if (parts.includes("hans")) return "zh-CN";
  if (parts.some((part) => ["hant", "tw", "hk", "mo"].includes(part))) return undefined;
  return "zh-CN";
}

/** Explicit locale wins over weighted language preferences; unsupported locales use English. */
export function resolveCatalogLocale(locale?: string, acceptLanguage?: string): CatalogLocale {
  if (locale !== undefined) return matchLocale(locale) ?? "en";
  const preferences = (acceptLanguage ?? "").split(",").map((entry) => {
    const [language = "", ...parameters] = entry.trim().split(";");
    const quality = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
    const weight = quality === undefined ? 1 : Number(quality.trim().slice(2));
    return { locale: matchLocale(language), weight };
  });
  return (
    preferences
      .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0 && entry.weight <= 1)
      .sort((left, right) => right.weight - left.weight)
      .find((entry) => entry.locale !== undefined)?.locale ?? "en"
  );
}

function localizeFields<T extends CredentialDefinition>(fields: T[], translations?: Record<string, DisplayText>): T[] {
  if (!translations) return fields;
  return fields.map((field) => {
    const text = translations?.[field.key];
    if (!text) return field;
    return {
      ...field,
      label: text.label ?? field.label,
      description: text.description ?? field.description,
      placeholder: text.placeholder ?? field.placeholder,
    };
  });
}

/** Creates a display-only projection; action contracts and authentication mechanics retain their original values. */
export function localizeProvider<T extends CatalogProviderMetadata>(
  provider: T,
  locale: CatalogLocale,
): T & { categoryDisplayNames?: Record<string, string> } {
  if (locale === "en") return provider;
  const text = zhCN.providers[provider.service];
  const auth = provider.auth.map((auth): ProviderAuthDefinition => {
    switch (auth.type) {
      case "no_auth":
        return auth;
      case "api_key": {
        const translated = text?.auth?.api_key;
        if (!translated && auth.label !== undefined) return auth;
        return {
          ...auth,
          label: translated?.label ?? auth.label ?? zhCN.labels.apiKey,
          description: translated?.description ?? auth.description,
          placeholder: translated?.placeholder ?? auth.placeholder,
          extraFields: auth.extraFields && localizeFields(auth.extraFields, translated?.fields),
        };
      }
      case "custom_credential": {
        const translated = text?.auth?.custom_credential;
        if (!translated) return auth;
        return {
          ...auth,
          label: translated?.label ?? auth.label,
          description: translated?.description ?? auth.description,
          fields: localizeFields(auth.fields, translated?.fields),
        };
      }
      case "oauth2": {
        const translated = text?.auth?.oauth2;
        if (!translated) return auth;
        return {
          ...auth,
          clientConfigFields: auth.clientConfigFields && localizeFields(auth.clientConfigFields, translated?.fields),
          clientSetup:
            auth.clientSetup && translated.steps ? { ...auth.clientSetup, steps: translated.steps } : auth.clientSetup,
          authorizationOptions: auth.authorizationOptions?.map((option) => ({
            ...option,
            label: translated?.authorizationOptions?.[option.id]?.label ?? option.label,
            description: translated?.authorizationOptions?.[option.id]?.description ?? option.description,
          })),
        };
      }
    }
  });
  return {
    ...provider,
    displayName: text?.displayName ?? provider.displayName,
    description: text?.description ?? provider.description,
    categoryDisplayNames: Object.fromEntries(
      provider.categories.map((category) => [category, zhCN.categories[category] ?? category]),
    ),
    auth,
  };
}
