import type { AppData, ProviderDefinition } from "./model";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import { ProvidersPage } from "./providers-page";

const useEffectMock = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: useEffectMock,
  };
});

beforeEach(() => {
  useEffectMock.mockClear();
});

describe("ProvidersPage OAuth polling effects", () => {
  it("stops OAuth refresh polling when the refreshed connection record changes", () => {
    renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(
          MemoryRouter,
          { initialEntries: ["/providers/gmail"] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/providers/:service",
              element: createElement(ProvidersPage, { data: connectedProviderData, onRefresh() {} }),
            }),
          ),
        ),
      ),
    );

    expect(
      useEffectMock.mock.calls.some(([, deps]) => Array.isArray(deps) && deps.length === 1 && deps[0] === connection),
    ).toBe(true);
  });
});

const oauthProvider: ProviderDefinition = {
  service: "gmail",
  displayName: "Gmail",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      scopes: ["email"],
    },
  ],
  actions: [],
};

const connection: AppData["connections"][number] = {
  service: "gmail",
  authType: "oauth2",
  metadata: {},
};

const connectedProviderData: AppData = {
  providers: [oauthProvider],
  connections: [connection],
  oauthConfigs: [{ service: "gmail", configured: true, clientId: "gmail-client-id" }],
  runtimeTokens: [],
  runs: [],
};
