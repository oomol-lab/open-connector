import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import { OAuthSourceForm, SaasProjectSettings } from "./saas-project-settings";

it("explains the project credential boundary before enabling configuration", () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("en") },
      createElement(SaasProjectSettings, { onRefresh: vi.fn() }),
    ),
  );
  expect(html).toContain("Project API key");
  expect(html).toContain("not a Marketplace key");
  expect(html).toContain('type="password"');
  expect(html).not.toContain('type="url"');
  expect(html).toContain('href="https://console.oomol.com/projects"');
  expect(html).toContain("Open cloud projects");
  expect(html).toContain("Action inputs and results pass through OOMOL cloud");
  expect(html).toContain("no spending limit is set here");
  expect(html).toContain("disabled");
});

it("keeps an existing remote source visible while discovery loads", () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("en") },
      createElement(OAuthSourceForm, {
        service: "gmail",
        onRefresh: vi.fn(),
        config: {
          service: "gmail",
          configured: false,
          clientId: null,
          oauthSource: {
            mode: "saas",
            managedProjectId: "local-project",
            projectId: "project",
            providerConfigId: "gmail-team",
          },
        },
      }),
    ),
  );
  expect(html).toContain("Applies to new connections only");
  expect(html).toContain("Existing connections keep their source");
  expect(html).toContain("Action inputs and results pass through OOMOL cloud");
  expect(html).toContain("Loading");
});
