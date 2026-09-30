import type { ActionDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { ActionPolicyService, parseActionPolicyList } from "./action-policy.ts";

const action: ActionDefinition = {
  id: "github.create_issue",
  service: "github",
  name: "create_issue",
  description: "Create an issue.",
  operationType: "write",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};
const defaultConnectionId = "11111111-1111-4111-8111-111111111111";
const workConnectionId = "22222222-2222-4222-8222-222222222222";
const otherConnectionId = "33333333-3333-4333-8333-333333333333";

describe("ActionPolicyService", () => {
  it("allows actions by default", () => {
    expect(new ActionPolicyService().createSnapshot().evaluate(action)).toEqual({ allowed: true, checks: [] });
  });

  it("enforces exact and provider-wide allowlists", () => {
    expect(new ActionPolicyService({ allowedActions: ["gmail.*"] }).createSnapshot().evaluate(action)).toMatchObject({
      allowed: false,
      code: "action_not_allowed",
    });
    expect(new ActionPolicyService({ allowedActions: ["github.*"] }).createSnapshot().evaluate(action)).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "github.*" }],
    });
    expect(
      new ActionPolicyService({ allowedActions: ["github.create_issue"] }).createSnapshot().evaluate(action),
    ).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "github.create_issue" }],
    });
  });

  it("supports bare wildcard to match all actions", () => {
    expect(new ActionPolicyService({ allowedActions: ["*"] }).createSnapshot().evaluate(action)).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "*" }],
    });
    expect(new ActionPolicyService({ blockedActions: ["*"] }).createSnapshot().evaluate(action)).toMatchObject({
      allowed: false,
      code: "action_blocked",
    });
  });

  it("blocks actions even when they are also allowed", () => {
    expect(
      new ActionPolicyService({
        allowedActions: ["github.*"],
        blockedActions: ["github.create_issue"],
      })
        .createSnapshot()
        .evaluate(action),
    ).toMatchObject({
      allowed: false,
      code: "action_blocked",
    });
  });

  it("allows proxies by default", () => {
    expect(new ActionPolicyService().createSnapshot().evaluateProxy("github")).toEqual({ allowed: true, checks: [] });
  });

  it("ignores action policy when evaluating proxies", () => {
    expect(
      new ActionPolicyService({ allowedActions: ["github.get_current_user"] }).createSnapshot().evaluateProxy("github"),
    ).toEqual({
      allowed: true,
      checks: [],
    });
    expect(
      new ActionPolicyService({ blockedActions: ["github.delete_repository"] })
        .createSnapshot()
        .evaluateProxy("github"),
    ).toEqual({
      allowed: true,
      checks: [],
    });
    expect(new ActionPolicyService({ allowedActions: ["*"] }).createSnapshot().evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [],
    });
    expect(new ActionPolicyService({ blockedActions: ["*"] }).createSnapshot().evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [],
    });
  });

  it("ignores proxy policy when evaluating actions", () => {
    expect(new ActionPolicyService({ blockedProxies: ["*"] }).createSnapshot().evaluate(action)).toEqual({
      allowed: true,
      checks: [],
    });
    expect(new ActionPolicyService({ allowedProxies: ["slack"] }).createSnapshot().evaluate(action)).toEqual({
      allowed: true,
      checks: [],
    });
  });

  it("disables every proxy with a blocked wildcard", () => {
    expect(new ActionPolicyService({ blockedProxies: ["*"] }).createSnapshot().evaluateProxy("github")).toMatchObject({
      allowed: false,
      code: "proxy_blocked",
    });
  });

  it("enforces exact and wildcard proxy allowlists", () => {
    expect(
      new ActionPolicyService({ allowedProxies: ["slack"] }).createSnapshot().evaluateProxy("github"),
    ).toMatchObject({
      allowed: false,
      code: "proxy_not_allowed",
    });
    expect(new ActionPolicyService({ allowedProxies: ["github"] }).createSnapshot().evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "github" }],
    });
    expect(new ActionPolicyService({ allowedProxies: ["*"] }).createSnapshot().evaluateProxy("github")).toEqual({
      allowed: true,
      checks: [{ source: "deployment", outcome: "allow_match", rule: "*" }],
    });
  });

  it("blocks proxies even when they are also allowed", () => {
    expect(
      new ActionPolicyService({
        allowedProxies: ["*"],
        blockedProxies: ["github"],
      })
        .createSnapshot()
        .evaluateProxy("github"),
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
          allowedConnections: [workConnectionId],
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
        allowedConnections: [workConnectionId],
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
      expect(snapshot.evaluateConnection(workConnectionId)).toEqual({ allowed: true, checks: [] });
      expect(snapshot.evaluate(action)).toEqual({ allowed: true, checks: [] });
    }
  });

  it("matches restricted connections by exact stable IDs", () => {
    const snapshot = new ActionPolicyService().createSnapshot(undefined, {
      allowedActions: ["github.*"],
      blockedActions: [],
      allowedProxies: ["github"],
      allowedConnections: [workConnectionId, defaultConnectionId],
    });

    expect(snapshot.evaluateConnection(workConnectionId)).toEqual({
      allowed: true,
      checks: [{ source: "token", outcome: "allow_match", rule: workConnectionId }],
    });
    expect(snapshot.evaluateConnection(defaultConnectionId)).toEqual({
      allowed: true,
      checks: [{ source: "token", outcome: "allow_match", rule: defaultConnectionId }],
    });
    expect(snapshot.evaluateConnection(otherConnectionId)).toMatchObject({
      allowed: false,
      code: "connection_not_allowed",
      checks: [{ source: "token", outcome: "allow_miss" }],
    });
    expect(snapshot.evaluateConnection()).toMatchObject({
      allowed: false,
      code: "connection_not_allowed",
    });
    expect(snapshot.evaluate(action)).toMatchObject({ allowed: true });
    expect(snapshot.evaluateProxy("github")).toMatchObject({ allowed: true });
  });

  it("requires restricted tokens to grant the exact selected connection ID", () => {
    const snapshot = new ActionPolicyService().createSnapshot(undefined, {
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: [workConnectionId],
    });

    expect(snapshot.evaluateConnection()).toMatchObject({
      allowed: false,
      code: "connection_not_allowed",
    });
    expect(snapshot.evaluateConnection(defaultConnectionId)).toMatchObject({
      allowed: false,
      code: "connection_not_allowed",
    });
    expect(snapshot.evaluateConnection(workConnectionId)).toMatchObject({ allowed: true });
  });
});

describe("Trigger policy", () => {
  const rules = { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] };
  it("grants Triggers independently and denies legacy tokens by default", () => {
    const service = new ActionPolicyService();
    expect(
      service.createSnapshot(rules, { ...rules, allowedProxies: ["*"] }).evaluateTrigger("github.on_repo_event"),
    ).toMatchObject({ allowed: false, code: "trigger_not_allowed" });
    const token = { ...rules, blockedActions: ["*"], allowedTriggers: ["github.on_repo_event"] };
    expect(service.createSnapshot(rules, token).evaluateTrigger("github.on_repo_event").allowed).toBe(true);
    expect(service.createSnapshot(rules, token).evaluateTrigger("github.watch_pull_request").allowed).toBe(false);
    expect(service.createSnapshot(rules, token).evaluateProxy("github").allowed).toBe(false);
    expect(service.createSnapshot(rules, token).evaluate(action).allowed).toBe(false);
  });
  it("intersects deployment and runtime grants and gives block rules priority", () => {
    const service = new ActionPolicyService({ allowedTriggers: ["gmail.*"] });
    const token = { ...rules, allowedTriggers: ["*"] };
    expect(
      service
        .createSnapshot({ ...rules, blockedTriggers: ["github.*"] }, token)
        .evaluateTrigger("github.on_repo_event"),
    ).toMatchObject({ allowed: false, code: "trigger_blocked" });
    expect(
      service
        .createSnapshot({ ...rules, allowedTriggers: ["gmail.other"] }, token)
        .evaluateTrigger("gmail.on_message_received"),
    ).toMatchObject({ allowed: false, code: "trigger_not_allowed" });
    expect(service.createSnapshot(rules, token).evaluateTrigger("gmail.on_message_received").allowed).toBe(true);
  });
});
