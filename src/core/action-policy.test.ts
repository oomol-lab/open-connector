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
    expect(new ActionPolicyService().evaluate(action)).toEqual({ allowed: true });
  });

  it("enforces exact and provider-wide allowlists", () => {
    expect(new ActionPolicyService({ allowedActions: ["gmail.*"] }).evaluate(action)).toMatchObject({
      allowed: false,
      code: "action_not_allowed",
    });
    expect(new ActionPolicyService({ allowedActions: ["github.*"] }).evaluate(action)).toEqual({
      allowed: true,
    });
    expect(new ActionPolicyService({ allowedActions: ["github.create_issue"] }).evaluate(action)).toEqual({
      allowed: true,
    });
  });

  it("supports bare wildcard to match all actions", () => {
    expect(new ActionPolicyService({ allowedActions: ["*"] }).evaluate(action)).toEqual({
      allowed: true,
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
    expect(new ActionPolicyService().evaluateProxy("github")).toEqual({ allowed: true });
  });

  it("ignores action policy when evaluating proxies", () => {
    expect(new ActionPolicyService({ allowedActions: ["github.get_current_user"] }).evaluateProxy("github")).toEqual({
      allowed: true,
    });
    expect(new ActionPolicyService({ blockedActions: ["github.delete_repository"] }).evaluateProxy("github")).toEqual({
      allowed: true,
    });
    expect(new ActionPolicyService({ allowedActions: ["*"] }).evaluateProxy("github")).toEqual({ allowed: true });
    expect(new ActionPolicyService({ blockedActions: ["*"] }).evaluateProxy("github")).toEqual({ allowed: true });
  });

  it("ignores proxy policy when evaluating actions", () => {
    expect(new ActionPolicyService({ blockedProxies: ["*"] }).evaluate(action)).toEqual({ allowed: true });
    expect(new ActionPolicyService({ allowedProxies: ["slack"] }).evaluate(action)).toEqual({ allowed: true });
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
    });
    expect(new ActionPolicyService({ allowedProxies: ["*"] }).evaluateProxy("github")).toEqual({
      allowed: true,
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
});
