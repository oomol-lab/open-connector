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
      { allowedActions: ["github.*"], blockedActions: [], allowedProxies: [], allowedConnections: [] },
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
      {
        allowedActions: ["github.*"],
        blockedActions: ["github.create_issue"],
        allowedProxies: [],
        allowedConnections: [],
      },
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

  it("requires runtime tokens to grant proxies independently of action rules", () => {
    const service = new ActionPolicyService({ allowedProxies: ["github"] });
    const runtime = {
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      blockedProxies: [],
    };

    expect(
      service
        .createSnapshot(runtime, {
          allowedActions: ["*"],
          blockedActions: [],
          allowedProxies: [],
          allowedConnections: [],
        })
        .evaluateProxy("github"),
    ).toMatchObject({
      allowed: false,
      code: "proxy_not_allowed",
      checks: [
        { source: "deployment", outcome: "allow_match", rule: "github" },
        { source: "token", outcome: "allow_miss" },
      ],
    });

    expect(
      service
        .createSnapshot(runtime, {
          allowedActions: ["gmail.send_email"],
          blockedActions: ["github.create_issue"],
          allowedProxies: ["github"],
          allowedConnections: ["work"],
        })
        .evaluateProxy("github"),
    ).toEqual({
      allowed: true,
      checks: [
        { source: "deployment", outcome: "allow_match", rule: "github" },
        { source: "token", outcome: "allow_match", rule: "github" },
      ],
    });
  });

  it("keeps allowedConnections on the token policy without changing deployment rules", () => {
    const snapshot = new ActionPolicyService().createSnapshot(
      {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        blockedProxies: [],
      },
      {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: ["work"],
      },
    );

    expect(snapshot.state.deployment).not.toHaveProperty("allowedConnections");
    expect(snapshot.state.runtime).not.toHaveProperty("allowedConnections");
    expect(snapshot.evaluate(action)).toEqual({ allowed: true, checks: [] });
    expect(snapshot.evaluateProxy("github")).toMatchObject({
      allowed: false,
      code: "proxy_not_allowed",
    });
  });

  it("treats omitted and empty allowedConnections as unrestricted connection access", () => {
    const unrestricted = [
      new ActionPolicyService().createSnapshot(),
      new ActionPolicyService().createSnapshot(undefined, {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
      }),
      new ActionPolicyService().createSnapshot(undefined, {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: [],
      }),
    ];

    for (const snapshot of unrestricted) {
      expect(snapshot.evaluateConnection()).toEqual({ allowed: true, checks: [] });
      expect(snapshot.evaluateConnection("work")).toEqual({ allowed: true, checks: [] });
      expect(snapshot.evaluate(action)).toEqual({ allowed: true, checks: [] });
    }
  });

  it("matches restricted connections by exact normalized bare names", () => {
    const snapshot = new ActionPolicyService().createSnapshot(undefined, {
      allowedActions: ["github.*"],
      blockedActions: [],
      allowedProxies: ["github"],
      allowedConnections: ["work", "default"],
    });

    expect(snapshot.evaluateConnection("work")).toEqual({
      allowed: true,
      checks: [{ source: "token", outcome: "allow_match", rule: "work" }],
    });
    expect(snapshot.evaluateConnection(" work ")).toEqual({
      allowed: true,
      checks: [{ source: "token", outcome: "allow_match", rule: "work" }],
    });
    expect(snapshot.evaluateConnection()).toEqual({
      allowed: true,
      checks: [{ source: "token", outcome: "allow_match", rule: "default" }],
    });
    expect(snapshot.evaluateConnection("")).toEqual({
      allowed: true,
      checks: [{ source: "token", outcome: "allow_match", rule: "default" }],
    });
    expect(snapshot.evaluateConnection("personal")).toMatchObject({
      allowed: false,
      code: "connection_not_allowed",
      checks: [{ source: "token", outcome: "allow_miss" }],
    });
    expect(snapshot.evaluate(action)).toMatchObject({ allowed: true });
    expect(snapshot.evaluateProxy("github")).toMatchObject({ allowed: true });
  });

  it("requires restricted tokens to grant default for the unnamed connection path", () => {
    const snapshot = new ActionPolicyService().createSnapshot(undefined, {
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: ["work"],
    });

    expect(snapshot.evaluateConnection()).toMatchObject({
      allowed: false,
      code: "connection_not_allowed",
    });
    expect(snapshot.evaluateConnection("default")).toMatchObject({
      allowed: false,
      code: "connection_not_allowed",
    });
    expect(snapshot.evaluateConnection("work")).toMatchObject({ allowed: true });
  });
});
