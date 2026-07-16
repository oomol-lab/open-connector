import type { ActionDefinition } from "./types.ts";

export type ActionPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "action_not_allowed" | "action_blocked" | "proxy_not_allowed" | "proxy_blocked";
      message: string;
    };

export type ActionPolicyConfig = {
  allowedActions?: string[];
  blockedActions?: string[];
  allowedProxies?: string[];
  blockedProxies?: string[];
};

/**
 * Local execution policy used before invoking provider executors.
 */
export class ActionPolicyService {
  private readonly allowed: ActionMatcher[];
  private readonly blocked: ActionMatcher[];
  private readonly allowedProxies: ProxyMatcher[];
  private readonly blockedProxies: ProxyMatcher[];
  private readonly restrictsActions: boolean;

  constructor(config: ActionPolicyConfig = {}) {
    this.allowed = (config.allowedActions ?? []).map(createMatcher);
    this.blocked = (config.blockedActions ?? []).map(createMatcher);
    this.allowedProxies = (config.allowedProxies ?? []).map(createProxyMatcher);
    this.blockedProxies = (config.blockedProxies ?? []).map(createProxyMatcher);
    this.restrictsActions = this.allowed.length > 0 || this.blocked.length > 0;
  }

  evaluate(action: ActionDefinition): ActionPolicyDecision {
    if (this.blocked.some((matcher) => matcher(action.id))) {
      return {
        allowed: false,
        code: "action_blocked",
        message: `${action.id} is blocked by the local action policy.`,
      };
    }

    if (this.allowed.length > 0 && !this.allowed.some((matcher) => matcher(action.id))) {
      return {
        allowed: false,
        code: "action_not_allowed",
        message: `${action.id} is not included in the local action allowlist.`,
      };
    }

    return { allowed: true };
  }

  evaluateProxy(service: string): ActionPolicyDecision {
    if (this.blockedProxies.some((matcher) => matcher(service))) {
      return {
        allowed: false,
        code: "proxy_blocked",
        message: `${service} proxy is blocked by the local proxy policy.`,
      };
    }

    if (this.allowedProxies.length > 0) {
      if (this.allowedProxies.some((matcher) => matcher(service))) {
        return { allowed: true };
      }
      return {
        allowed: false,
        code: "proxy_not_allowed",
        message: `${service} proxy is not included in the local proxy allowlist.`,
      };
    }

    if (this.restrictsActions) {
      return {
        allowed: false,
        code: "proxy_not_allowed",
        message: `${service} proxy must be explicitly allowed when local action policy is configured.`,
      };
    }

    return { allowed: true };
  }
}

type ActionMatcher = (actionId: string) => boolean;
type ProxyMatcher = (service: string) => boolean;

export function parseActionPolicyList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createMatcher(pattern: string): ActionMatcher {
  if (pattern === "*") {
    return () => true;
  }

  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    return (actionId) => actionId.startsWith(prefix);
  }

  return (actionId) => actionId === pattern;
}

function createProxyMatcher(pattern: string): ProxyMatcher {
  if (pattern === "*") {
    return () => true;
  }

  return (service) => service === pattern;
}
