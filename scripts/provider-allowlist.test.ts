import { describe, expect, it } from "vitest";
import {
  assertKnownProviders,
  formatProviderAllowlistMarker,
  parseProviderAllowlist,
  readProviderAllowlist,
  readProviderAllowlistMarker,
} from "./provider-allowlist.ts";

describe("parseProviderAllowlist", () => {
  it("splits on commas, trims, drops empty entries, dedupes and sorts", () => {
    expect(parseProviderAllowlist(" salesforce, googlecalendar ,,hubspot,salesforce,")).toEqual([
      "googlecalendar",
      "hubspot",
      "salesforce",
    ]);
  });

  it.each([undefined, "", "   ", " , ,"])("treats %j as unset", (value) => {
    expect(parseProviderAllowlist(value)).toBeUndefined();
  });

  it("reads OPENCONNECTOR_PROVIDERS from the given environment", () => {
    expect(readProviderAllowlist({ OPENCONNECTOR_PROVIDERS: "hubspot" })).toEqual(["hubspot"]);
    expect(readProviderAllowlist({})).toBeUndefined();
  });
});

describe("assertKnownProviders", () => {
  it("accepts ids that are all known", () => {
    expect(() => assertKnownProviders(["hubspot"], ["googlecalendar", "hubspot"])).not.toThrow();
  });

  it("names every unknown id and suggests close matches", () => {
    expect(() =>
      assertKnownProviders(["hubsopt", "google_calendar", "nonexistent"], ["googlecalendar", "hubspot", "slack"]),
    ).toThrow(
      "OPENCONNECTOR_PROVIDERS lists unknown providers: hubsopt (did you mean hubspot?), " +
        "google_calendar (did you mean googlecalendar?), nonexistent",
    );
  });
});

describe("provider allowlist marker", () => {
  it("round-trips the allowlist a registry was built with", () => {
    const marker = formatProviderAllowlistMarker(["googlecalendar", "hubspot"]);
    expect(readProviderAllowlistMarker(`import x;\n\n${marker}\nexport const a = 1;\n`)).toEqual([
      "googlecalendar",
      "hubspot",
    ]);
  });

  it("reads no allowlist from a registry built without one", () => {
    expect(readProviderAllowlistMarker("export const executorModules = {};\n")).toBeUndefined();
  });
});
