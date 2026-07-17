import type { LocaleLang, Locales } from "@embra/i18n";

import { I18n, detectLang } from "@embra/i18n";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ja from "./locales/ja.json";
import ru from "./locales/ru.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

export type AppLang = "en" | "zh-CN" | "zh-TW" | "ja" | "ru" | "fr";

export const supportedLangs = ["en", "zh-CN", "zh-TW", "ja", "ru", "fr"] as const satisfies readonly AppLang[];
export const langStorageKey = "oomol-connect.lang";

const locales = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ru,
  fr,
} satisfies Locales;

export function createAppI18n(initialLang: AppLang): I18n {
  return new I18n(initialLang, locales, { fallback: "en" });
}

export function resolveInitialLang(input: { storedLang: string | null; detectedLang: string | null }): AppLang {
  return toAppLang(input.storedLang) ?? matchAppLang(input.detectedLang) ?? "en";
}

export function readInitialLang(storage: Storage | undefined = globalThis.localStorage): AppLang {
  return resolveInitialLang({
    storedLang: storage?.getItem(langStorageKey) ?? null,
    detectedLang: detectLang(),
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

// Regions and scripts that write Chinese in Traditional characters.
const traditionalChineseSubtags = new Set(["tw", "hk", "mo", "hant"]);

function matchAppLang(value: string | null): AppLang | undefined {
  if (!value) {
    return undefined;
  }
  const locale = value.toLowerCase();
  const subtags = locale.split("-");
  // Chinese cannot be matched on a prefix: zh-HK and zh-Hant-TW are Traditional,
  // zh-Hans-CN and zh-SG are Simplified. Same split as the OAuth completion page.
  // An explicit script wins over the region, so zh-Hans-HK stays Simplified.
  if (subtags[0] === "zh") {
    if (subtags.includes("hans")) {
      return "zh-CN";
    }
    return subtags.some((subtag) => traditionalChineseSubtags.has(subtag)) ? "zh-TW" : "zh-CN";
  }
  return supportedLangs.find((lang) => locale.startsWith(lang.toLowerCase()));
}
