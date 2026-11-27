import type { ReactNode } from "react";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import { OAuthScopeEditor, useOAuthScopeSelection } from "./oauth-scope-editor";

it.each([
  { defaults: undefined },
  { defaults: [] },
  { defaults: ["https://www.googleapis.com/auth/gmail.send", "openid"] },
])("includes connection prerequisites in the displayed and submitted scopes: %j", ({ defaults }) => {
  let selected: string[] = [];
  function Probe(): ReactNode {
    selected = useOAuthScopeSelection(defaults, ["openid", "email"]).selectedScopes;
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  expect(selected).toEqual([...new Set([...(defaults ?? []), "openid", "email"])]);
});

it.each([{ businessScopes: [] }, { businessScopes: ["https://www.googleapis.com/auth/gmail.send"] }])(
  "keeps identity permissions visible and non-removable in custom mode: %j",
  ({ businessScopes }) => {
    const requiredScopes = ["openid", "email"];
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(OAuthScopeEditor, {
          options: undefined,
          requiredScopes,
          selection: {
            selectedScopes: [...businessScopes, ...requiredScopes],
            custom: true,
            setCustom: vi.fn(),
            setScopes: vi.fn(),
            toggleScope: vi.fn(),
          },
        }),
      ),
    );
    for (const scope of requiredScopes) {
      expect(markup).toContain(`title="${scope}"`);
      expect(markup).not.toContain(`Remove ${scope}`);
    }
    for (const scope of businessScopes) expect(markup).toContain(`Remove ${scope}`);
    expect(markup.includes("Only the basic permissions needed to connect will be requested.")).toBe(
      businessScopes.length == 0,
    );
  },
);
