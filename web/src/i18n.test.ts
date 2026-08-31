import { describe, expect, it } from "vitest";
import { createAppI18n, resolveInitialLang, supportedLangs } from "./i18n";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ja from "./locales/ja.json";
import ru from "./locales/ru.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

type LocaleTree = { [key: string]: string | LocaleTree };

function flattenLocale(tree: LocaleTree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : flattenLocale(value, `${prefix}${key}.`),
  );
}

function placeholders(value: string): string[] {
  return (value.match(/{{\w+}}/g) ?? []).sort();
}

function englishWords(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).sort().join(" ");
}

describe("resolveInitialLang", () => {
  it("uses a stored supported language first", () => {
    expect(resolveInitialLang({ storedLang: "fr", detectedLang: "zh-CN" })).toBe("fr");
  });

  it("uses the detected supported language when no stored language exists", () => {
    expect(resolveInitialLang({ storedLang: null, detectedLang: "ru" })).toBe("ru");
  });

  it("matches a detected language against its region sub-tag", () => {
    expect(resolveInitialLang({ storedLang: null, detectedLang: "en-US" })).toBe("en");
    expect(resolveInitialLang({ storedLang: null, detectedLang: "fr-CA" })).toBe("fr");
  });

  it("resolves Traditional Chinese regions and scripts to zh-TW", () => {
    for (const detectedLang of ["zh-TW", "zh-Hant", "zh-Hant-TW", "zh-HK", "zh-Hant-HK", "zh-MO"]) {
      expect(resolveInitialLang({ storedLang: null, detectedLang })).toBe("zh-TW");
    }
  });

  it("resolves the remaining Chinese locales to zh-CN", () => {
    for (const detectedLang of ["zh", "zh-CN", "zh-Hans", "zh-Hans-CN", "zh-SG"]) {
      expect(resolveInitialLang({ storedLang: null, detectedLang })).toBe("zh-CN");
    }
  });

  it("lets an explicit Chinese script win over the region", () => {
    for (const detectedLang of ["zh-Hans-HK", "zh-Hans-MO", "zh-Hans-TW"]) {
      expect(resolveInitialLang({ storedLang: null, detectedLang })).toBe("zh-CN");
    }
    expect(resolveInitialLang({ storedLang: null, detectedLang: "zh-Hant-CN" })).toBe("zh-TW");
  });

  it("falls back to English for unsupported values", () => {
    expect(resolveInitialLang({ storedLang: "de", detectedLang: "ko" })).toBe("en");
  });
});

describe("createAppI18n", () => {
  it("creates an i18n instance with app translations", () => {
    const french = createAppI18n("fr");
    const japanese = createAppI18n("ja");
    const russian = createAppI18n("ru");
    const simplifiedChinese = createAppI18n("zh-CN");
    const traditionalChinese = createAppI18n("zh-TW");

    expect(french.lang).toBe("fr");
    expect(french.t("nav.providers")).toBe("Fournisseurs");
    expect(french.t("language.fr")).toBe("Français");
    expect(french.t("providers.categories.all")).toBe("Toutes les catégories");
    expect(japanese.t("providers.categories.all")).toBe("すべてのカテゴリー");
    expect(russian.lang).toBe("ru");
    expect(russian.t("nav.providers")).toBe("Провайдеры");
    expect(russian.t("language.ru")).toBe("Русский");
    expect(russian.t("providers.categories.all")).toBe("Все категории");
    expect(simplifiedChinese.t("providers.categories.all")).toBe("所有分类");
    expect(traditionalChinese.lang).toBe("zh-TW");
    expect(traditionalChinese.t("nav.providers")).toBe("服務提供者");
    expect(traditionalChinese.t("language.zh-TW")).toBe("繁體中文");
    expect(traditionalChinese.t("providers.categories.all")).toBe("所有分類");
    expect(supportedLangs).toEqual(["en", "zh-CN", "zh-TW", "ja", "ru", "fr"]);
  });
});

describe("locales", () => {
  // A missing key silently falls back to English at runtime, so parity is only
  // ever caught here.
  const enEntries = flattenLocale(en);

  // Product and protocol names every locale renders in English on purpose. A
  // multi-word value that matches en without being one of these is an
  // untranslated string, not a deliberate one. Matching ignores case, so a
  // locale respelling a term ("OAuth app" -> "OAuth App") still needs it here.
  const englishTerms = new Set([
    "API Key",
    "API key",
    "API Reference",
    "Callback URL",
    "Client ID",
    "Client Secret",
    "Connector Marketplace",
    "Discovery URL",
    "MCP URL",
    "OAuth app",
    "OAuth Apps",
    "OpenAPI JSON",
  ]);

  // Entries whose English wording is also the correct wording in that locale.
  const englishKeys: Record<string, string[]> = {
    // "{{count}} actions" is spelled the same way in French.
    fr: ["actions.actionsCount"],
  };

  // Locales that write their own words in a non-Latin script. Reordering the
  // English words there leaves the value in English, while in French the same
  // reordering is the translation ("Local MCP client" -> "Client MCP local").
  // The heuristic cannot separate that from a locale fronting a Latin acronym
  // ("MCP URL" -> ru "URL MCP"), so such a value goes on englishTerms above.
  const nonLatinScriptLangs = new Set(["zh-CN", "zh-TW", "ja", "ru"]);

  it.each([
    ["zh-CN", zhCN],
    ["zh-TW", zhTW],
    ["ja", ja],
    ["ru", ru],
    ["fr", fr],
  ] satisfies [string, LocaleTree][])(
    "%s matches the en keys and placeholders and leaves no multi-word English value untranslated",
    (lang, locale) => {
      const entries = flattenLocale(locale);
      expect(entries.map(([key]) => key)).toEqual(enEntries.map(([key]) => key));

      const translations = new Map(entries);
      for (const [key, value] of enEntries) {
        expect(placeholders(translations.get(key) ?? "")).toEqual(placeholders(value));
      }

      const allowedKeys = englishKeys[lang] ?? [];
      const untranslated = enEntries
        .filter(([, value]) => value.trim().split(/\s+/).length > 1)
        .filter(([key, value]) => !englishTerms.has(value) && !allowedKeys.includes(key))
        .filter(([key, value]) => {
          // A value copied from en reads as English, and so does one that only
          // shuffles the same English words.
          const translated = translations.get(key) ?? "";
          return (
            translated === value || (nonLatinScriptLangs.has(lang) && englishWords(translated) === englishWords(value))
          );
        })
        .map(([key]) => key);
      expect(untranslated).toEqual([]);
    },
  );
});
