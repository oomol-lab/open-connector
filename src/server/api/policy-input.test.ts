import { describe, expect, it } from "vitest";
import {
  policyRuleListMaxItems,
  policyRuleMaxBytes,
  readRuntimePolicyRules,
  readTokenActionPolicy,
} from "./policy-input.ts";

describe("policy input", () => {
  it("trims and stably deduplicates complete Runtime policy rules", () => {
    expect(
      readRuntimePolicyRules({
        allowedActions: [" github.* ", "github.*", "github.create_issue"],
        blockedActions: [],
        allowedProxies: [" github ", "github"],
        blockedProxies: ["*"],
      }),
    ).toEqual({
      allowedActions: ["github.*", "github.create_issue"],
      blockedActions: [],
      allowedProxies: ["github"],
      blockedProxies: ["*"],
    });
  });

  it("allows omitted token rules only during creation", () => {
    expect(readTokenActionPolicy({}, true)).toEqual({ allowedActions: [], blockedActions: [] });
    expect(() => readTokenActionPolicy({})).toThrow("allowedActions must be an array of strings");
  });

  it.each(["github*", "github.*.issues", "github.", ".create_issue", "github create_issue"])(
    "rejects invalid action rule %s",
    (rule) => {
      expect(() => readTokenActionPolicy({ allowedActions: [rule], blockedActions: [] })).toThrow(
        "contains an invalid action rule",
      );
    },
  );

  it("rejects invalid proxy wildcards", () => {
    expect(() =>
      readRuntimePolicyRules({
        allowedActions: [],
        blockedActions: [],
        allowedProxies: ["git*"],
        blockedProxies: [],
      }),
    ).toThrow("contains an invalid proxy rule");
    expect(() => readTokenActionPolicy({ allowedActions: [], blockedActions: [], allowedProxies: ["github"] })).toThrow(
      "does not support proxy rules",
    );
  });

  it("enforces normalized item and UTF-8 byte limits", () => {
    const rules = Array.from({ length: policyRuleListMaxItems + 1 }, (_, index) => `github.action_${index}`);
    expect(() => readTokenActionPolicy({ allowedActions: rules, blockedActions: [] })).toThrow(
      `more than ${policyRuleListMaxItems}`,
    );
    expect(() =>
      readTokenActionPolicy({ allowedActions: [`github.${"界".repeat(policyRuleMaxBytes)}`], blockedActions: [] }),
    ).toThrow(`${policyRuleMaxBytes} UTF-8 bytes`);
  });
});
