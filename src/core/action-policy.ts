import type { ActionDefinition } from "./types.ts";

export type PolicySource = "deployment" | "runtime" | "token";

export type PolicyErrorCode = "action_not_allowed" | "action_blocked" | "proxy_not_allowed" | "proxy_blocked";

export interface PolicyCheck {
  source: PolicySource;
  outcome: "allow_match" | "block_match" | "allow_miss";
  rule?: string;
}

export type ActionPolicyDecision =
  | { allowed: true; checks: PolicyCheck[] }
  | {
      allowed: false;
      code: PolicyErrorCode;
      message: string;
      checks: PolicyCheck[];
    };

export interface PolicyRules {
  allowedActions: string[];
  blockedActions: string[];
  allowedProxies: string[];
  blockedProxies: string[];
}

export interface TokenActionPolicy {
  allowedActions: string[];
  blockedActions: string[];
}

export interface RuntimePolicyState {
  deployment: PolicyRules;
  runtime: PolicyRules;
  updatedAt?: string;
}

export interface ActionPolicyConfig {
  allowedActions?: string[];
  blockedActions?: string[];
  allowedProxies?: string[];
  blockedProxies?: string[];
}

interface CompiledRule {
  pattern: string;
  matches(value: string): boolean;
}

interface CompiledLayer {
  source: PolicySource;
  allowedActions: CompiledRule[];
  blockedActions: CompiledRule[];
  allowedProxies: CompiledRule[];
  blockedProxies: CompiledRule[];
}

/**
 * Immutable policy view shared by every policy consumer in one request.
 */
export class ActionPolicySnapshot {
  readonly state: RuntimePolicyState;
  private readonly layers: CompiledLayer[];
  private readonly proxyLayers: CompiledLayer[];

  constructor(deployment: PolicyRules, runtime: PolicyRules, token?: TokenActionPolicy, updatedAt?: string) {
    const deploymentRules = immutablePolicyRules(deployment);
    const runtimeRules = immutablePolicyRules(runtime);
    this.state = Object.freeze({ deployment: deploymentRules, runtime: runtimeRules, updatedAt });
    this.proxyLayers = [compileLayer("deployment", deploymentRules), compileLayer("runtime", runtimeRules)];
    this.layers = [...this.proxyLayers];
    if (token) {
      const tokenRules = immutablePolicyRules({
        allowedActions: token.allowedActions,
        blockedActions: token.blockedActions,
        allowedProxies: [],
        blockedProxies: [],
      });
      this.layers.push(compileLayer("token", tokenRules));
    }
  }

  evaluate(action: ActionDefinition): ActionPolicyDecision {
    for (const layer of this.layers) {
      const blocked = layer.blockedActions.find((rule) => rule.matches(action.id));
      if (blocked) {
        return {
          allowed: false,
          code: "action_blocked",
          message: `${action.id} is blocked by the local action policy.`,
          checks: [{ source: layer.source, outcome: "block_match", rule: blocked.pattern }],
        };
      }
    }

    const checks: PolicyCheck[] = [];
    for (const layer of this.layers) {
      if (layer.allowedActions.length === 0) {
        continue;
      }
      const allowed = layer.allowedActions.find((rule) => rule.matches(action.id));
      if (!allowed) {
        return {
          allowed: false,
          code: "action_not_allowed",
          message: `${action.id} is not included in the local action allowlist.`,
          checks: [...checks, { source: layer.source, outcome: "allow_miss" }],
        };
      }
      checks.push({ source: layer.source, outcome: "allow_match", rule: allowed.pattern });
    }

    return { allowed: true, checks };
  }

  evaluateProxy(service: string): ActionPolicyDecision {
    for (const layer of this.proxyLayers) {
      const blocked = layer.blockedProxies.find((rule) => rule.matches(service));
      if (blocked) {
        return {
          allowed: false,
          code: "proxy_blocked",
          message: `${service} proxy is blocked by the local proxy policy.`,
          checks: [{ source: layer.source, outcome: "block_match", rule: blocked.pattern }],
        };
      }
    }

    const checks: PolicyCheck[] = [];
    for (const layer of this.proxyLayers) {
      if (layer.allowedProxies.length === 0) {
        continue;
      }
      const allowed = layer.allowedProxies.find((rule) => rule.matches(service));
      if (!allowed) {
        return {
          allowed: false,
          code: "proxy_not_allowed",
          message: `${service} proxy is not included in the local proxy allowlist.`,
          checks: [...checks, { source: layer.source, outcome: "allow_miss" }],
        };
      }
      checks.push({ source: layer.source, outcome: "allow_match", rule: allowed.pattern });
    }

    return { allowed: true, checks };
  }
}

/**
 * Deployment execution policy used to construct request-scoped policy snapshots.
 */
export class ActionPolicyService {
  readonly rules: PolicyRules;

  constructor(config: ActionPolicyConfig = {}) {
    this.rules = policyRules(config);
  }

  createSnapshot(
    runtime: PolicyRules = emptyPolicyRules(),
    token?: TokenActionPolicy,
    updatedAt?: string,
  ): ActionPolicySnapshot {
    return new ActionPolicySnapshot(this.rules, runtime, token, updatedAt);
  }

  evaluate(action: ActionDefinition): ActionPolicyDecision {
    return this.createSnapshot().evaluate(action);
  }

  evaluateProxy(service: string): ActionPolicyDecision {
    return this.createSnapshot().evaluateProxy(service);
  }
}

export function emptyPolicyRules(): PolicyRules {
  return {
    allowedActions: [],
    blockedActions: [],
    allowedProxies: [],
    blockedProxies: [],
  };
}

export function parseActionPolicyList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function policyRules(config: ActionPolicyConfig): PolicyRules {
  return immutablePolicyRules({
    allowedActions: config.allowedActions ?? [],
    blockedActions: config.blockedActions ?? [],
    allowedProxies: config.allowedProxies ?? [],
    blockedProxies: config.blockedProxies ?? [],
  });
}

function immutablePolicyRules(rules: PolicyRules): PolicyRules {
  const immutable = {
    allowedActions: [...rules.allowedActions],
    blockedActions: [...rules.blockedActions],
    allowedProxies: [...rules.allowedProxies],
    blockedProxies: [...rules.blockedProxies],
  };
  Object.freeze(immutable.allowedActions);
  Object.freeze(immutable.blockedActions);
  Object.freeze(immutable.allowedProxies);
  Object.freeze(immutable.blockedProxies);
  return Object.freeze(immutable);
}

function compileLayer(source: PolicySource, rules: PolicyRules): CompiledLayer {
  return {
    source,
    allowedActions: rules.allowedActions.map(compileActionRule),
    blockedActions: rules.blockedActions.map(compileActionRule),
    allowedProxies: rules.allowedProxies.map(compileProxyRule),
    blockedProxies: rules.blockedProxies.map(compileProxyRule),
  };
}

function compileActionRule(pattern: string): CompiledRule {
  if (pattern === "*") {
    return { pattern, matches: () => true };
  }
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    return { pattern, matches: (actionId) => actionId.startsWith(prefix) };
  }
  return { pattern, matches: (actionId) => actionId === pattern };
}

function compileProxyRule(pattern: string): CompiledRule {
  return { pattern, matches: pattern === "*" ? () => true : (service) => service === pattern };
}
