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

  it("requires explicit proxy allowlists when action policy is configured", () => {
    expect(new ActionPolicyService({ allowedActions: ["github.get_current_user"] }).evaluateProxy("github")).toEqual({
      allowed: false,
      code: "proxy_not_allowed",
      message: "github proxy must be explicitly allowed when local action policy is configured.",
    });
    expect(new ActionPolicyService({ blockedActions: ["github.delete_repository"] }).evaluateProxy("github")).toEqual({
      allowed: false,
      code: "proxy_not_allowed",
      message: "github proxy must be explicitly allowed when local action policy is configured.",
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
