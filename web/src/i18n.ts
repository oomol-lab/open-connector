import type { LocaleLang, Locales } from "@embra/i18n";

import { I18n, detectLang } from "@embra/i18n";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ja from "./locales/ja.json";
import ru from "./locales/ru.json";
import zhCN from "./locales/zh-CN.json";

export type AppLang = "en" | "zh-CN" | "ja" | "ru" | "fr";

export const supportedLangs = ["en", "zh-CN", "ja", "ru", "fr"] as const satisfies readonly AppLang[];
export const langStorageKey = "oomol-connect.lang";

const locales = {
  en,
  "zh-CN": zhCN,
  ja,
  ru,
  fr,
} satisfies Locales;

export function createAppI18n(initialLang: AppLang): I18n {
  return new I18n(initialLang, locales, { fallback: "en" });
}

export function resolveInitialLang(input: { storedLang: string | null; detectedLang: string | null }): AppLang {
  return toAppLang(input.storedLang) ?? toAppLang(input.detectedLang) ?? "en";
}

export function readInitialLang(storage: Storage | undefined = globalThis.localStorage): AppLang {
  return resolveInitialLang({
    storedLang: storage?.getItem(langStorageKey) ?? null,
    detectedLang: detectLang(supportedLangs),
  });
}

export function persistLang(lang: LocaleLang, storage: Storage | undefined = globalThis.localStorage): void {
  const appLang = toAppLang(lang);
  if (appLang) {
    storage?.setItem(langStorageKey, appLang);
  }
}

function toAppLang(value: string | null): AppLang | undefined {
  return supportedLangs.find((lang) => lang === value);
}
