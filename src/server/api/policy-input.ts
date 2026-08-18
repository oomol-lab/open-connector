import type { PolicyRules, TokenPolicy } from "../../core/action-policy.ts";
import type { JsonRequestBody } from "./http-utils.ts";

import { Buffer } from "node:buffer";
import { requiredStringArray } from "../../core/cast.ts";
import { HttpRequestError } from "./http-utils.ts";

export const policyRequestMaxBytes: number = 256 * 1024;
export const policyRuleMaxBytes: number = 256;
export const policyRuleListMaxItems: number = 128;

export function readRuntimePolicyRules(body: JsonRequestBody): PolicyRules {
  return {
    allowedActions: readRules(body.allowedActions, "allowedActions", "action"),
    blockedActions: readRules(body.blockedActions, "blockedActions", "action"),
    allowedProxies: readRules(body.allowedProxies, "allowedProxies", "proxy"),
    blockedProxies: readRules(body.blockedProxies, "blockedProxies", "proxy"),
  };
}

export function readTokenPolicy(body: JsonRequestBody, allowOmitted = false): TokenPolicy {
  if (body.blockedProxies !== undefined) {
    throw invalidInput("Token policy does not support proxy block rules.");
  }
  return {
    allowedActions: readRules(body.allowedActions, "allowedActions", "action", allowOmitted),
    blockedActions: readRules(body.blockedActions, "blockedActions", "action", allowOmitted),
    allowedProxies: readRules(body.allowedProxies, "allowedProxies", "proxy", allowOmitted),
    allowedConnections: readConnectionNames(body.allowedConnections, "allowedConnections"),
  };
}

function readRules(value: unknown, fieldName: string, kind: "action" | "proxy", allowOmitted = false): string[] {
  if (value === undefined && allowOmitted) {
    return [];
  }
  const values = requiredStringArray(value, fieldName, invalidInput);
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const rule = value.trim();
    if (!rule) {
      throw invalidInput(`${fieldName} must not contain empty rules.`);
    }
    if (Buffer.byteLength(rule, "utf8") > policyRuleMaxBytes) {
      throw invalidInput(`${fieldName} rules must not exceed ${policyRuleMaxBytes} UTF-8 bytes.`);
    }
    assertRuleSyntax(rule, fieldName, kind);
    if (!seen.has(rule)) {
      seen.add(rule);
      rules.push(rule);
    }
  }
  if (rules.length > policyRuleListMaxItems) {
    throw invalidInput(`${fieldName} must not contain more than ${policyRuleListMaxItems} rules.`);
  }
  return rules;
}

function readConnectionNames(value: unknown, fieldName: string): string[] {
  if (value === undefined) {
    return [];
  }
  const values = requiredStringArray(value, fieldName, invalidInput);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const name = item.trim();
    if (!name) {
      throw invalidInput(`${fieldName} must not contain empty connection names.`);
    }
    if (Buffer.byteLength(name, "utf8") > policyRuleMaxBytes) {
      throw invalidInput(`${fieldName} rules must not exceed ${policyRuleMaxBytes} UTF-8 bytes.`);
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) {
      throw invalidInput(`${fieldName} contains an invalid connection name: ${name}.`);
    }
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  if (names.length > policyRuleListMaxItems) {
    throw invalidInput(`${fieldName} must not contain more than ${policyRuleListMaxItems} rules.`);
  }
  return names;
}

function assertRuleSyntax(rule: string, fieldName: string, kind: "action" | "proxy"): void {
  if (rule === "*") {
    return;
  }
  if (kind === "proxy") {
    if (rule.includes("*") || /\s/.test(rule)) {
      throw invalidInput(`${fieldName} contains an invalid proxy rule: ${rule}.`);
    }
    return;
  }
  if (/^[^\s.*]+\.\*$/.test(rule)) {
    return;
  }
  const separator = rule.indexOf(".");
  if (rule.includes("*") || /\s/.test(rule) || separator <= 0 || separator === rule.length - 1) {
    throw invalidInput(`${fieldName} contains an invalid action rule: ${rule}.`);
  }
}

function invalidInput(message: string): HttpRequestError {
  return new HttpRequestError("invalid_input", message);
}
