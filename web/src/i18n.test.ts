import { describe, expect, it } from "vitest";
import { createAppI18n, resolveInitialLang, supportedLangs } from "./i18n";

describe("resolveInitialLang", () => {
  it("uses a stored supported language first", () => {
    expect(resolveInitialLang({ storedLang: "fr", detectedLang: "zh-CN" })).toBe("fr");
  });

  it("uses the detected supported language when no stored language exists", () => {
    expect(resolveInitialLang({ storedLang: null, detectedLang: "ru" })).toBe("ru");
  });

  it("falls back to English for unsupported values", () => {
    expect(resolveInitialLang({ storedLang: "de", detectedLang: "ko" })).toBe("en");
  });
});

describe("createAppI18n", () => {
  it("creates an i18n instance with app translations", () => {
    const french = createAppI18n("fr");
    const russian = createAppI18n("ru");

    expect(french.lang).toBe("fr");
    expect(french.t("nav.providers")).toBe("Fournisseurs");
    expect(french.t("language.fr")).toBe("Français");
    expect(russian.lang).toBe("ru");
    expect(russian.t("nav.providers")).toBe("Провайдеры");
    expect(russian.t("language.ru")).toBe("Русский");
    expect(supportedLangs).toEqual(["en", "zh-CN", "ja", "ru", "fr"]);
  });
});
