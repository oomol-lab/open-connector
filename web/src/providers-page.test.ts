import type { AuthDefinition } from "./model";

import { describe, expect, it } from "vitest";
import { shouldShowConnectionActions, shouldShowOAuthClientForm } from "./providers-page";

describe("shouldShowOAuthClientForm", () => {
  it("hides OAuth client settings while API key auth is selected", () => {
    const auth: AuthDefinition = { type: "api_key" };

    expect(shouldShowOAuthClientForm(auth)).toBe(false);
  });

  it("shows OAuth client settings while OAuth auth is selected", () => {
    const auth: AuthDefinition = { type: "oauth2", scopes: [] };

    expect(shouldShowOAuthClientForm(auth)).toBe(true);
  });
});

describe("shouldShowConnectionActions", () => {
  it("hides connection actions for no-auth providers", () => {
    expect(shouldShowConnectionActions({ type: "no_auth" })).toBe(false);
  });

  it("shows connection actions when credentials or OAuth are required", () => {
    expect(shouldShowConnectionActions({ type: "api_key" })).toBe(true);
    expect(shouldShowConnectionActions({ type: "oauth2", scopes: [] })).toBe(true);
  });
});
