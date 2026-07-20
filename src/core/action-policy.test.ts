import type { ActionDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { ActionPolicyService, parseActionPolicyList } from "./action-policy.ts";

const action: ActionDefinition = {
  id: "github.create_issue",
  service: "github",
  name: "create_issue",
  description: "Create an issue.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

describe("ActionPolicyService", () => {
  it("allows actions by default", () => {
    expect(new ActionPolicyService().evaluate(action)).toEqual({ allowed: true, checks: [] });
  });

  it("enforces exact and provider-wide allowlists", () => {
    expect(new ActionPolicyService({ allowedActions: ["gmail.*"] }).evaluate(action)).toMatchObject({
      allowed: false,
      code: "action_not_allowed",
    });
    expect(new ActionPolicyService({ allowedActions: ["github.*"] }).evaluate(action)).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "github.*" }],
    });
    expect(new ActionPolicyService({ allowedActions: ["github.create_issue"] }).evaluate(action)).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "github.create_issue" }],
    });
  });

  it("supports bare wildcard to match all actions", () => {
    expect(new ActionPolicyService({ allowedActions: ["*"] }).evaluate(action)).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "*" }],
    });
    expect(new ActionPolicyService({ blockedActions: ["*"] }).evaluate(action)).toMatchObject({
      allowed: false,
      code: "action_blocked",
    });
  });

  it("blocks actions even when they are also allowed", () => {
    expect(
      new ActionPolicyService({
        allowedActions: ["github.*"],
        blockedActions: ["github.create_issue"],
      }).evaluate(action),
    ).toMatchObject({
      allowed: false,
      code: "action_blocked",
    });
  });

  it("allows proxies by default", () => {
    expect(new ActionPolicyService().evaluateProxy("github")).toEqual({ allowed: true, checks: [] });
  });

  it("ignores action policy when evaluating proxies", () => {
    expect(new ActionPolicyService({ allowedActions: ["github.get_current_user"] }).evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [],
    });
    expect(new ActionPolicyService({ blockedActions: ["github.delete_repository"] }).evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [],
    });
    expect(new ActionPolicyService({ allowedActions: ["*"] }).evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [],
    });
    expect(new ActionPolicyService({ blockedActions: ["*"] }).evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [],
    });
  });

  it("ignores proxy policy when evaluating actions", () => {
    expect(new ActionPolicyService({ blockedProxies: ["*"] }).evaluate(action)).toEqual({
      allowed: true,
      checks: [],
    });
    expect(new ActionPolicyService({ allowedProxies: ["slack"] }).evaluate(action)).toEqual({
      allowed: true,
      checks: [],
    });
  });

  it("disables every proxy with a blocked wildcard", () => {
    expect(new ActionPolicyService({ blockedProxies: ["*"] }).evaluateProxy("github")).toMatchObject({
      allowed: false,
      code: "proxy_blocked",
    });
  });

  it("enforces exact and wildcard proxy allowlists", () => {
    expect(new ActionPolicyService({ allowedProxies: ["slack"] }).evaluateProxy("github")).toMatchObject({
      allowed: false,
      code: "proxy_not_allowed",
    });
    expect(new ActionPolicyService({ allowedProxies: ["github"] }).evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "github" }],
    });
    expect(new ActionPolicyService({ allowedProxies: ["*"] }).evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "*" }],
    });
  });

  it("blocks proxies even when they are also allowed", () => {
    expect(
      new ActionPolicyService({
        allowedProxies: ["*"],
        blockedProxies: ["github"],
      }).evaluateProxy("github"),
    ).toMatchObject({
      allowed: false,
      code: "proxy_blocked",
    });
  });

  it("parses comma-separated environment lists", () => {
    expect(parseActionPolicyList(" github.* , gmail.send_email ,, ")).toEqual(["github.*", "gmail.send_email"]);
  });

  it("intersects deployment, runtime, and token action allowlists", () => {
    const snapshot = new ActionPolicyService({ allowedActions: ["github.*"] }).createSnapshot(
      {
        allowedActions: ["github.create_issue"],
        blockedActions: [],
        allowedProxies: [],
        blockedProxies: [],
      },
      { allowedActions: ["github.*"], blockedActions: [] },
    );

    expect(snapshot.evaluate(action)).toEqual({
      allowed: true,
      checks: [
        { source: "deployment", outcome: "allow_match", rule: "github.*" },
        { source: "runtime", outcome: "allow_match", rule: "github.create_issue" },
        { source: "token", outcome: "allow_match", rule: "github.*" },
      ],
    });
  });

  it("reports the decisive layer when a lower allowlist rejects", () => {
    const snapshot = new ActionPolicyService({ allowedActions: ["github.*"] }).createSnapshot({
      allowedActions: ["gmail.*"],
      blockedActions: [],
      allowedProxies: [],
      blockedProxies: [],
    });

    expect(snapshot.evaluate(action)).toMatchObject({
      allowed: false,
      code: "action_not_allowed",
      checks: [
        { source: "deployment", outcome: "allow_match", rule: "github.*" },
        { source: "runtime", outcome: "allow_miss" },
      ],
    });
  });

  it("applies Runtime and token block rules before every allowlist", () => {
    const service = new ActionPolicyService({ allowedActions: ["*"] });
    const runtimeBlocked = service.createSnapshot({
      allowedActions: ["github.*"],
      blockedActions: ["github.create_issue"],
      allowedProxies: [],
      blockedProxies: [],
    });
    expect(runtimeBlocked.evaluate(action)).toMatchObject({
      allowed: false,
      code: "action_blocked",
      checks: [{ source: "runtime", outcome: "block_match", rule: "github.create_issue" }],
    });

    const tokenBlocked = service.createSnapshot(
      {
        allowedActions: ["github.*"],
        blockedActions: [],
        allowedProxies: [],
        blockedProxies: [],
      },
      { allowedActions: ["github.*"], blockedActions: ["github.create_issue"] },
    );
    expect(tokenBlocked.evaluate(action)).toMatchObject({
      allowed: false,
      checks: [{ source: "token", outcome: "block_match", rule: "github.create_issue" }],
    });
  });

  it("records only the first matching rule from each layer", () => {
    const decision = new ActionPolicyService({ allowedActions: ["github.*", "*"] })
      .createSnapshot({
        allowedActions: ["github.create_issue", "github.*"],
        blockedActions: [],
        allowedProxies: [],
        blockedProxies: [],
      })
      .evaluate(action);

    expect(decision).toEqual({
      allowed: true,
      checks: [
        { source: "deployment", outcome: "allow_match", rule: "github.*" },
        { source: "runtime", outcome: "allow_match", rule: "github.create_issue" },
      ],
    });
  });
});
