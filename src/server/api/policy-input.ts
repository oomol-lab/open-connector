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
    allowedTriggers: readRules(body.allowedTriggers, "allowedTriggers", "action", true),
    blockedTriggers: readRules(body.blockedTriggers, "blockedTriggers", "action", true),
  };
}

export function readTokenPolicy(body: JsonRequestBody, allowOmitted = false): TokenPolicy {
  if (body.blockedTriggers !== undefined) {
    throw invalidInput("Token policy does not support Trigger block rules.");
  }
  if (body.blockedProxies !== undefined) {
    throw invalidInput("Token policy does not support proxy block rules.");
  }
  const policy: TokenPolicy = {
    allowedActions: readRules(body.allowedActions, "allowedActions", "action", allowOmitted),
    blockedActions: readRules(body.blockedActions, "blockedActions", "action", allowOmitted),
    allowedProxies: readRules(body.allowedProxies, "allowedProxies", "proxy", allowOmitted),
    allowedTriggers: readRules(body.allowedTriggers, "allowedTriggers", "action", true),
    allowedConnections: readAllowedConnections(body.allowedConnections, allowOmitted),
  };
  if (body.actionInputConstraints !== undefined) {
    policy.actionInputConstraints = readActionInputConstraints(body.actionInputConstraints, false);
  }
  return policy;
}

function readActionInputConstraints(
  value: unknown,
  allowOmitted: boolean,
): Record<string, Record<string, string | number | boolean | null>> | undefined {
  if (value === undefined) return allowOmitted ? {} : undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidInput("actionInputConstraints must be an object keyed by action rule.");
  }
  const entries = Object.entries(value);
  if (entries.length > policyRuleListMaxItems) {
    throw invalidInput(`actionInputConstraints must not contain more than ${policyRuleListMaxItems} entries.`);
  }
  return Object.fromEntries(
    entries.map(([rule, fields]) => {
      const normalizedRule = rule.trim();
      assertRuleSyntax(normalizedRule, "actionInputConstraints", "action");
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
        throw invalidInput(`actionInputConstraints.${normalizedRule} must be an object keyed by input field.`);
      }
      const fieldEntries = Object.entries(fields);
      if (fieldEntries.length === 0 || fieldEntries.length > policyRuleListMaxItems) {
        throw invalidInput(
          `actionInputConstraints.${normalizedRule} must contain between 1 and ${policyRuleListMaxItems} fields.`,
        );
      }
      return [
        normalizedRule,
        Object.fromEntries(
          fieldEntries.map(([field, expected]) => {
            const normalizedField = field.trim();
            if (!normalizedField || /\s/.test(normalizedField)) {
              throw invalidInput(`actionInputConstraints.${normalizedRule} contains an invalid field: ${field}.`);
            }
            if (
              expected !== null &&
              typeof expected !== "string" &&
              typeof expected !== "number" &&
              typeof expected !== "boolean"
            ) {
              throw invalidInput(
                `actionInputConstraints.${normalizedRule}.${normalizedField} must be a scalar JSON value.`,
              );
            }
            if (typeof expected === "number" && !Number.isFinite(expected)) {
              throw invalidInput(
                `actionInputConstraints.${normalizedRule}.${normalizedField} must be a finite number.`,
              );
            }
            if (typeof expected === "string" && Buffer.byteLength(expected, "utf8") > policyRuleMaxBytes) {
              throw invalidInput(
                `actionInputConstraints.${normalizedRule}.${normalizedField} must not exceed ${policyRuleMaxBytes} UTF-8 bytes.`,
              );
            }
            return [normalizedField, expected];
          }),
        ),
      ];
    }),
  );
}

function readAllowedConnections(
  value: unknown,
  allowOmitted: boolean,
): string[] | Record<string, string | null> | undefined {
  if (value === undefined) {
    if (allowOmitted) return [];
    throw invalidInput("allowedConnections must be an array of strings or an object keyed by service.");
  }
  if (Array.isArray(value)) return readConnectionIds(value, "allowedConnections", false);
  if (!value || typeof value !== "object") {
    throw invalidInput("allowedConnections must be an array of IDs or an object keyed by service.");
  }
  const entries = Object.entries(value);
  if (entries.length > policyRuleListMaxItems) {
    throw invalidInput(`allowedConnections must not contain more than ${policyRuleListMaxItems} entries.`);
  }
  return Object.fromEntries(
    entries.map(([service, connectionName]) => {
      const normalizedService = service.trim();
      if (!normalizedService || /\s/.test(normalizedService) || normalizedService.includes("*")) {
        throw invalidInput(`allowedConnections contains an invalid service: ${service}.`);
      }
      if (connectionName !== null && typeof connectionName !== "string") {
        throw invalidInput(`allowedConnections.${normalizedService} must be a connection name or null.`);
      }
      const normalizedConnection = typeof connectionName === "string" ? connectionName.trim() : null;
      if (typeof connectionName === "string" && !normalizedConnection) {
        throw invalidInput(`allowedConnections.${normalizedService} must not be empty.`);
      }
      if (normalizedConnection && Buffer.byteLength(normalizedConnection, "utf8") > policyRuleMaxBytes) {
        throw invalidInput(
          `allowedConnections.${normalizedService} must not exceed ${policyRuleMaxBytes} UTF-8 bytes.`,
        );
      }
      return [normalizedService, normalizedConnection];
    }),
  );
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

function readConnectionIds(value: unknown, fieldName: string, allowOmitted = false): string[] {
  if (value === undefined && allowOmitted) {
    return [];
  }
  const values = requiredStringArray(value, fieldName, invalidInput);
  const connectionIds: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const connectionId = item.trim();
    if (!connectionId) {
      throw invalidInput(`${fieldName} must not contain empty connection IDs.`);
    }
    if (Buffer.byteLength(connectionId, "utf8") > policyRuleMaxBytes) {
      throw invalidInput(`${fieldName} IDs must not exceed ${policyRuleMaxBytes} UTF-8 bytes.`);
    }
    if (!seen.has(connectionId)) {
      seen.add(connectionId);
      connectionIds.push(connectionId);
    }
  }
  if (connectionIds.length > policyRuleListMaxItems) {
    throw invalidInput(`${fieldName} must not contain more than ${policyRuleListMaxItems} rules.`);
  }
  return connectionIds;
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
