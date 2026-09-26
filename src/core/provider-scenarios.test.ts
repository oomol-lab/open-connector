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
    expect(resolveProviderScenario(provider({ service: "lingxing_mcp", categories: ["Productivity"] }))).toBe(
      "cross-border-ecommerce",
    );
  });

  it("maps detailed source categories to a task-oriented scenario", () => {
    expect(resolveProviderScenario(provider({ categories: ["Developer Tools", "Data"] }))).toBe("developer");
    expect(resolveProviderScenario(provider({ categories: ["Storage"] }))).toBe("data-storage");
    expect(resolveProviderScenario(provider({ categories: ["Docs"] }))).toBe("communication");
  });

  it("combines document and messaging providers in collaboration", () => {
    expect(resolveProviderScenario(provider({ service: "notion", categories: ["Productivity"] }))).toBe(
      "communication",
    );
    expect(resolveProviderScenario(provider({ service: "slack", categories: ["Communication"] }))).toBe(
      "communication",
    );
  });

  it.each(["hithink_finance", "financial_modeling_prep", "coinbase", "investoday_mcp", "alpaca"])(
    "classifies %s as investment before broad Finance or Data categories",
    (service) => {
      expect(resolveProviderScenario(provider({ service, categories: ["Finance", "Data"] }))).toBe("investment");
    },
  );

  it("keeps payment and accounting providers out of investment", () => {
    expect(resolveProviderScenario(provider({ service: "paypal", categories: ["Finance"] }))).toBe("other");
    expect(resolveProviderScenario(provider({ service: "xero", categories: ["Finance", "Productivity"] }))).toBe(
      "productivity",
    );
  });

  it("uses provider metadata when source categories are too broad", () => {
    expect(
      resolveProviderScenario(
        provider({ displayName: "Acme Knowledge Base", description: "Read and write internal documents." }),
      ),
    ).toBe("communication");
  });

  it("matches scenario keywords as whole words while retaining transcription prefixes", () => {
    expect(resolveProviderScenario(provider({ displayName: "Email Service" }))).toBe("communication");
    expect(resolveProviderScenario(provider({ displayName: "Transcriber Service" }))).toBe("ai");
  });

  it("falls back to other when a provider has no reliable scenario signal", () => {
    expect(resolveProviderScenario(provider({ categories: ["Finance"] }))).toBe("other");
  });
});
