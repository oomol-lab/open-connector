import type { ClientFormInput, OAuthClientSummary } from "./oauth-clients-page";

import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "./i18n";
import {
  SUPPORTED_OAUTH_SCOPES,
  clearOneTimeSecret,
  clientSummaryFromApi,
  isConfidentialAuthMethod,
  isValidRedirectUri,
  OAuthClientsList,
  showOneTimeSecret,
  toRedirectUriList,
  validateClientInput,
} from "./oauth-clients-page";

const manualClient: OAuthClientSummary = {
  clientId: "client-manual-1",
  clientName: "ChatGPT",
  registrationType: "manual",
  redirectUris: ["https://chatgpt.com/connector_platform_oauth/callback"],
  scopes: ["mcp:access", "offline_access"],
  tokenEndpointAuthMethod: "client_secret_basic",
  hasSecret: true,
  createdAt: "2026-11-03T10:00:00.000Z",
};

const dcrClient: OAuthClientSummary = {
  clientId: "client-dcr-1",
  clientName: "Local CLI",
  registrationType: "dcr",
  redirectUris: ["http://127.0.0.1:1455/callback"],
  scopes: ["mcp:access"],
  tokenEndpointAuthMethod: "none",
  hasSecret: false,
  createdAt: "2026-11-03T11:00:00.000Z",
};

function renderList(clients: OAuthClientSummary[]): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      { i18n: createAppI18n("en") },
      createElement(OAuthClientsList, {
        clients,
        onEdit: () => {},
        onDelete: () => {},
        onRotated: () => {},
      }),
    ),
  );
}

describe("clientSummaryFromApi", () => {
  it("normalizes an admin API summary and keeps optional fields absent", () => {
    const summary = clientSummaryFromApi({
      clientId: "client-1",
      clientName: "ChatGPT",
      registrationType: "cimd",
      redirectUris: ["https://chatgpt.com/callback"],
      scopes: ["mcp:access"],
      tokenEndpointAuthMethod: "none",
      hasSecret: false,
      metadataDocumentUrl: "https://chatgpt.com/.well-known/oauth-client",
      createdAt: "2026-11-03T10:00:00.000Z",
      rotatedAt: null,
    });

    expect(summary).toEqual({
      clientId: "client-1",
      clientName: "ChatGPT",
      registrationType: "cimd",
      redirectUris: ["https://chatgpt.com/callback"],
      scopes: ["mcp:access"],
      tokenEndpointAuthMethod: "none",
      hasSecret: false,
      metadataDocumentUrl: "https://chatgpt.com/.well-known/oauth-client",
      createdAt: "2026-11-03T10:00:00.000Z",
      rotatedAt: undefined,
    });
  });

  it("rejects payloads with unknown registration types or non-string URI lists", () => {
    expect(() => clientSummaryFromApi({ ...manualClient, registrationType: "magic" })).toThrow(TypeError);
    expect(() => clientSummaryFromApi({ ...manualClient, redirectUris: "https://example.com" })).toThrow(TypeError);
    expect(() => clientSummaryFromApi(null)).toThrow(TypeError);
  });
});

describe("toRedirectUriList", () => {
  it("splits a textarea value on newlines and commas, trimming blanks", () => {
    expect(
      toRedirectUriList(" https://a.example.com/cb \n\nhttps://b.example.com/cb, https://c.example.com\n"),
    ).toEqual(["https://a.example.com/cb", "https://b.example.com/cb", "https://c.example.com"]);
    expect(toRedirectUriList("   \n  ")).toEqual([]);
  });
});

describe("isValidRedirectUri", () => {
  it("accepts absolute https URIs and loopback http URIs only", () => {
    expect(isValidRedirectUri("https://chatgpt.com/connector_platform_oauth/callback")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1:1455/callback")).toBe(true);
    expect(isValidRedirectUri("http://localhost:8080")).toBe(true);
    expect(isValidRedirectUri("http://[::1]:9000")).toBe(true);
    expect(isValidRedirectUri("http://example.com/callback")).toBe(false);
    expect(isValidRedirectUri("https://example.com/cb?next=1")).toBe(false);
    expect(isValidRedirectUri("not a uri")).toBe(false);
    expect(isValidRedirectUri("ftp://example.com")).toBe(false);
  });
});

describe("validateClientInput", () => {
  const validInput: ClientFormInput = {
    clientName: "ChatGPT",
    redirectUris: ["https://chatgpt.com/callback"],
    tokenEndpointAuthMethod: "client_secret_basic",
    scopes: ["mcp:access"],
  };

  it("accepts a complete form", () => {
    expect(validateClientInput(validInput)).toEqual([]);
  });

  it("reports problems in field order", () => {
    expect(validateClientInput({ ...validInput, clientName: "  " })).toEqual(["oauthClients.errors.nameRequired"]);
    expect(validateClientInput({ ...validInput, redirectUris: [] })).toEqual([
      "oauthClients.errors.redirectUriRequired",
    ]);
    expect(
      validateClientInput({ ...validInput, redirectUris: ["https://ok.example.com", "http://example.com/cb"] }),
    ).toEqual(["oauthClients.errors.redirectUriInvalid"]);
    expect(validateClientInput({ ...validInput, scopes: ["mcp:access", "admin:*"] })).toEqual([
      "oauthClients.errors.scopeInvalid",
    ]);
    expect(validateClientInput({ ...validInput, clientName: "", redirectUris: [], scopes: ["nope"] })).toEqual([
      "oauthClients.errors.nameRequired",
      "oauthClients.errors.redirectUriRequired",
      "oauthClients.errors.scopeInvalid",
    ]);
  });

  it("treats public clients as non-confidential", () => {
    expect(isConfidentialAuthMethod("none")).toBe(false);
    expect(isConfidentialAuthMethod("client_secret_basic")).toBe(true);
    expect(isConfidentialAuthMethod("client_secret_post")).toBe(true);
    expect(SUPPORTED_OAUTH_SCOPES).toEqual(["mcp:access", "offline_access"]);
  });
});

describe("one-time secret visibility", () => {
  it("replaces any previously shown secret when a new one is revealed", () => {
    const first = showOneTimeSecret(null, "client-1", "ChatGPT", "secret-1");
    expect(first).toEqual({ clientId: "client-1", clientName: "ChatGPT", secret: "secret-1" });

    const second = showOneTimeSecret(first, "client-2", "CLI", "secret-2");
    expect(second).toEqual({ clientId: "client-2", clientName: "CLI", secret: "secret-2" });
  });

  it("dismisses only the client currently shown", () => {
    const state = showOneTimeSecret(null, "client-1", "ChatGPT", "secret-1");
    expect(clearOneTimeSecret(state, "client-2")).toBe(state);
    expect(clearOneTimeSecret(state, "client-1")).toBeNull();
    expect(clearOneTimeSecret(null, "client-1")).toBeNull();
  });
});

describe("OAuthClientsList", () => {
  it("renders client identity, badges, redirect URIs, scopes, and row actions", () => {
    const markup = renderList([manualClient, dcrClient]);

    expect(markup).toContain("ChatGPT");
    expect(markup).toContain("client-manual-1");
    expect(markup).toContain("https://chatgpt.com/connector_platform_oauth/callback");
    expect(markup).toContain("mcp:access");
    expect(markup).toContain("Confidential");
    expect(markup).toContain("Manual");
    expect(markup).toContain("Rotate secret");
    expect(markup).toContain("Dynamic (DCR)");
    expect(markup).toContain("Public");
    expect(markup).toContain("Delete");
  });

  it("hides the rotate action for public clients without secrets", () => {
    const markup = renderList([dcrClient]);

    expect(markup).not.toContain("Rotate secret");
    expect(markup).toContain("Edit");
    expect(markup).toContain("Delete");
  });
});
