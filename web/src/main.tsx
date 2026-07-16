import { I18nProvider } from "@embra/i18n/react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { createAppI18n, readInitialLang } from "./i18n";
import { App } from "./ui";
import "virtual:uno.css";
import "./style.css";

const i18n = createAppI18n(readInitialLang());

// Keep <html lang> in sync with the selected language (fires immediately for the initial lang).
i18n.lang$.subscribe((lang) => {
  document.documentElement.lang = lang;
});

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </I18nProvider>,
);
