import { describe, expect, it } from "vitest";
import { createAppI18n, resolveInitialLang, supportedLangs } from "./i18n";

describe("resolveInitialLang", () => {
  it("uses a stored supported language first", () => {
    expect(resolveInitialLang({ storedLang: "fr", detectedLang: "zh-CN" })).toBe("fr");
  });

  it("uses the detected supported language when no stored language exists", () => {
    expect(resolveInitialLang({ storedLang: null, detectedLang: "zh-TW" })).toBe("zh-TW");
  });

  it("falls back to English for unsupported values", () => {
    expect(resolveInitialLang({ storedLang: "de", detectedLang: "ko" })).toBe("en");
  });
});

describe("createAppI18n", () => {
  it("creates an i18n instance with app translations", () => {
    const french = createAppI18n("fr");
    const russian = createAppI18n("ru");
    const traditionalChinese = createAppI18n("zh-TW");

    expect(french.lang).toBe("fr");
    expect(french.t("nav.providers")).toBe("Fournisseurs");
    expect(french.t("language.fr")).toBe("Français");
    expect(russian.lang).toBe("ru");
    expect(russian.t("nav.providers")).toBe("Провайдеры");
    expect(russian.t("language.ru")).toBe("Русский");
    expect(traditionalChinese.lang).toBe("zh-TW");
    expect(traditionalChinese.t("nav.providers")).toBe("服務提供者");
    expect(traditionalChinese.t("language.zh-TW")).toBe("繁體中文");
    expect(supportedLangs).toEqual(["en", "zh-CN", "zh-TW", "ja", "ru", "fr"]);
  });
});
