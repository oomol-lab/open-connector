import type { ProviderDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { resolveProviderScenario } from "./provider-scenarios.ts";

function provider(overrides: Partial<ProviderDefinition>): ProviderDefinition {
  return {
    service: "example",
    displayName: "Example",
    categories: [],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions: [],
    ...overrides,
  };
}

describe("resolveProviderScenario", () => {
  it("uses an explicit service mapping before its broad source categories", () => {
    expect(
      resolveProviderScenario(
        provider({ service: "shopify_admin", displayName: "Shopify Admin", categories: ["Productivity"] }),
      ),
    ).toBe("cross-border-ecommerce");
  });

  it("keeps shared hosted-Console providers in their familiar scenarios", () => {
    expect(resolveProviderScenario(provider({ service: "gmail", categories: ["Productivity"] }))).toBe("communication");
    expect(resolveProviderScenario(provider({ service: "store_leads", categories: ["Data", "Marketing"] }))).toBe(
      "cross-border-ecommerce",
    );
  });

  it("maps detailed source categories to a task-oriented scenario", () => {
    expect(resolveProviderScenario(provider({ categories: ["Developer Tools", "Data"] }))).toBe("developer");
    expect(resolveProviderScenario(provider({ categories: ["Storage"] }))).toBe("data-storage");
  });

  it("uses provider metadata when source categories are too broad", () => {
    expect(
      resolveProviderScenario(
        provider({ displayName: "Acme Knowledge Base", description: "Read and write internal documents." }),
      ),
    ).toBe("docs");
  });

  it("matches scenario keywords as whole words while retaining transcription prefixes", () => {
    expect(resolveProviderScenario(provider({ displayName: "Email Service" }))).toBe("communication");
    expect(resolveProviderScenario(provider({ displayName: "Transcriber Service" }))).toBe("ai");
  });

  it("falls back to other when a provider has no reliable scenario signal", () => {
    expect(resolveProviderScenario(provider({ categories: ["Finance"] }))).toBe("other");
  });
});
