import { describe, expect, it } from "vitest";
import { policyRuleListMaxItems, policyRuleMaxBytes, readRuntimePolicyRules, readTokenPolicy } from "./policy-input.ts";

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
    expect(readTokenPolicy({}, true)).toEqual({
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
    });
    expect(() => readTokenPolicy({})).toThrow("allowedActions must be an array of strings");
  });

  it("treats omitted and empty allowedConnections as unrestricted on create", () => {
    expect(readTokenPolicy({ allowedActions: [], blockedActions: [], allowedProxies: [] }, true)).toEqual({
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
    });
    expect(
      readTokenPolicy({ allowedActions: [], blockedActions: [], allowedProxies: [], allowedConnections: [] }),
    ).toEqual({
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [],
    });
  });

  it("requires allowedConnections on update so a PUT cannot drop an existing grant", () => {
    expect(() => readTokenPolicy({ allowedActions: [], blockedActions: [], allowedProxies: [] })).toThrow(
      "allowedConnections must be an array of strings",
    );
  });

  it("trims and stably deduplicates allowedConnections", () => {
    expect(
      readTokenPolicy({
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: [" work ", "work", "personal"],
      }),
    ).toEqual({
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: ["work", "personal"],
    });
  });

  it.each(["", " ", "*", "work*", "github:work", "service:connectionName", "work connection", "-lead", "work:prod"])(
    "rejects invalid allowedConnections value %s",
    (name) => {
      expect(() =>
        readTokenPolicy({ allowedActions: [], blockedActions: [], allowedProxies: [], allowedConnections: [name] }),
      ).toThrow(/empty|invalid/);
    },
  );

  it("enforces allowedConnections item and UTF-8 byte limits", () => {
    const names = Array.from({ length: policyRuleListMaxItems + 1 }, (_, index) => `c${index}`);
    expect(() =>
      readTokenPolicy({ allowedActions: [], blockedActions: [], allowedProxies: [], allowedConnections: names }),
    ).toThrow(`more than ${policyRuleListMaxItems}`);
    expect(() =>
      readTokenPolicy({
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: ["a".repeat(policyRuleMaxBytes + 1)],
      }),
    ).toThrow(`${policyRuleMaxBytes} UTF-8 bytes`);
  });

  it.each(["github*", "github.*.issues", "github.", ".create_issue", "github create_issue"])(
    "rejects invalid action rule %s",
    (rule) => {
      expect(() => readTokenPolicy({ allowedActions: [rule], blockedActions: [], allowedProxies: [] })).toThrow(
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
    expect(() => readTokenPolicy({ allowedActions: [], blockedActions: [], allowedProxies: ["git*"] })).toThrow(
      "contains an invalid proxy rule",
    );
    expect(() =>
      readTokenPolicy({ allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: ["github"] }),
    ).toThrow("does not support proxy block rules");
  });

  it("enforces normalized item and UTF-8 byte limits", () => {
    const rules = Array.from({ length: policyRuleListMaxItems + 1 }, (_, index) => `github.action_${index}`);
    expect(() => readTokenPolicy({ allowedActions: rules, blockedActions: [], allowedProxies: [] })).toThrow(
      `more than ${policyRuleListMaxItems}`,
    );
    expect(() =>
      readTokenPolicy({
        allowedActions: [`github.${"界".repeat(policyRuleMaxBytes)}`],
        blockedActions: [],
        allowedProxies: [],
      }),
    ).toThrow(`${policyRuleMaxBytes} UTF-8 bytes`);
  });
});
