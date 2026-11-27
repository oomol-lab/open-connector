import { describe, expect, it } from "vitest";
import { assertKnownProviders } from "./provider-allowlist.ts";

describe("assertKnownProviders suggestions (review)", () => {
  // Short ids still allow one edit: floor(3 / 4) is 0, so the floor of 1 is what makes `bxo` find `box`.
  it("suggests a close match for a short id", () => {
    expect(() => assertKnownProviders(["bxo"], ["box", "slack"])).toThrow(
      "OPENCONNECTOR_PROVIDERS lists unknown providers: bxo (did you mean box?)",
    );
  });

  // Case alone is seven edits away; only the normalized comparison finds the match.
  it("suggests a match that differs only in case", () => {
    expect(() => assertKnownProviders(["HUBSPOT"], ["hubspot", "slack"])).toThrow(
      "OPENCONNECTOR_PROVIDERS lists unknown providers: HUBSPOT (did you mean hubspot?)",
    );
  });
});
