import { randomUUIDv7 } from "./uuid-v7.ts";

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };
type ParseResult<T> = { ok: true; value: T } | { ok: false };

export type ConnectionActionPermission =
  | { mode: "all" }
  | { mode: "none" }
  | { mode: "selected"; actionNames: string[] };

interface PermissionGrant {
  actionPermission: ConnectionActionPermission;
  appAccessConfig?: JsonObject;
}

export interface ConnectionPermissionGroup extends PermissionGrant {
  groupId: string;
  name: string;
  memberIds: string[];
}

export interface ConnectionPermissionGroupsState {
  sourceFormat: "unconfigured" | "legacy" | "multi";
  defaultGroup: PermissionGrant;
  groups: ConnectionPermissionGroup[];
}

export interface ConnectionPolicyTarget {
  appId: string;
  service: string;
}

export interface SerializedPermissionGroups {
  policy: Record<string, unknown>;
  state: ConnectionPermissionGroupsState;
  canonicalGroupIds: ReadonlyMap<string, string>;
}

const invalidParseResult = { ok: false } as const;

export function parseConnectionPermissionGroups(
  policy: unknown,
  target: ConnectionPolicyTarget,
  currentMemberIds: readonly string[],
): ParseResult<ConnectionPermissionGroupsState> {
  if (!isPlainObject(policy)) return invalidParseResult;
  const roleName = getConnectionRoleName(target.appId);
  const role = policy[`role::${roleName}`];
  if (role === undefined) {
    return {
      ok: true,
      value: {
        sourceFormat: "unconfigured",
        defaultGroup: { actionPermission: { mode: "all" } },
        groups: [],
      },
    };
  }
  if (!isPlainObject(role) || !Array.isArray(role.connector) || role.connector.length === 0) {
    return invalidParseResult;
  }
  const rule = role.connector[0];
  if (!isPlainObject(rule) || Object.hasOwn(rule, "effect")) return invalidParseResult;
  return Object.hasOwn(rule, "permissionRules")
    ? parseMultiPermissionGroups(rule, target, currentMemberIds)
    : parseLegacyPermissionGroups(policy, rule, target, currentMemberIds);
}

export function serializeConnectionPermissionGroups(
  policy: Record<string, unknown>,
  target: ConnectionPolicyTarget,
  state: ConnectionPermissionGroupsState,
): SerializedPermissionGroups {
  const canonicalGroupIds = new Map<string, string>();
  const groups = state.groups.map((group) => {
    const sourceId = group.groupId.trim();
    const groupId =
      state.sourceFormat === "legacy" && sourceId === getLegacyGroupId(target.appId) ? randomUUIDv7() : sourceId;
    canonicalGroupIds.set(sourceId, groupId);
    return {
      ...group,
      groupId,
      name: group.name.trim(),
      memberIds: uniqueSorted(group.memberIds),
      actionPermission: normalizeActionPermission(group.actionPermission),
    };
  });
  const groupIds = new Set<string>();
  for (const group of groups) {
    if (!group.groupId || !group.name || groupIds.has(group.groupId)) {
      throw new Error("Permission group identifiers must be non-empty and unique, and names must be non-empty");
    }
    groupIds.add(group.groupId);
  }

  const next = structuredClone(policy);
  const roleKey = `role::${getConnectionRoleName(target.appId)}`;
  const previousRole = isPlainObject(next[roleKey]) ? next[roleKey] : {};
  next[roleKey] = {
    ...previousRole,
    connector: [
      {
        app: [target.appId],
        method: "POST",
        provider: target.service,
        permissionRules: {
          teamDefault: buildPermissionGrant(state.defaultGroup),
          rules: groups.map((group) => ({
            id: group.groupId,
            name: group.name,
            ...buildPermissionGrant(group),
          })),
          assignments: Object.fromEntries(
            groups
              .flatMap((group) => group.memberIds.map((memberId) => [memberId, group.groupId] as const))
              .sort(([left], [right]) => left.localeCompare(right)),
          ),
        },
      },
    ],
  };
  removeLegacyMemberAssignments(next, getConnectionRoleName(target.appId));
  return {
    policy: next,
    state: {
      sourceFormat: "multi",
      defaultGroup: {
        ...state.defaultGroup,
        actionPermission: normalizeActionPermission(state.defaultGroup.actionPermission),
      },
      groups,
    },
    canonicalGroupIds,
  };
}

export function replacePermissionGroupMembers(
  state: ConnectionPermissionGroupsState,
  groupId: string,
  memberIds: readonly string[],
): ConnectionPermissionGroupsState {
  const selected = new Set(memberIds);
  return {
    ...state,
    groups: state.groups.map((group) => ({
      ...group,
      memberIds:
        group.groupId === groupId
          ? uniqueSorted(memberIds)
          : group.memberIds.filter((memberId) => !selected.has(memberId)),
    })),
  } satisfies ConnectionPermissionGroupsState;
}

export function toPermissionGroupsView(state: ConnectionPermissionGroupsState): {
  defaultGroup: {
    kind: "default";
    name: "Default permission group";
    memberScope: "all";
    deletable: false;
    actionPermission: ConnectionActionPermission;
  };
  groups: Array<{
    kind: "custom";
    groupId: string;
    name: string;
    memberIds: string[];
    actionPermission: ConnectionActionPermission;
  }>;
} {
  return {
    defaultGroup: {
      kind: "default" as const,
      name: "Default permission group" as const,
      memberScope: "all" as const,
      deletable: false as const,
      actionPermission: state.defaultGroup.actionPermission,
    },
    groups: state.groups.map((group) => ({
      kind: "custom" as const,
      groupId: group.groupId,
      name: group.name,
      memberIds: group.memberIds,
      actionPermission: group.actionPermission,
    })),
  };
}

function parseMultiPermissionGroups(
  rule: Record<string, unknown>,
  target: ConnectionPolicyTarget,
  currentMemberIds: readonly string[],
): ParseResult<ConnectionPermissionGroupsState> {
  if (
    !hasOnlyKeys(rule, ["app", "method", "provider", "permissionRules"]) ||
    rule.method !== "POST" ||
    rule.provider !== target.service ||
    !isPlainObject(rule.permissionRules) ||
    !hasOnlyKeys(rule.permissionRules, ["teamDefault", "rules", "assignments"]) ||
    !Object.hasOwn(rule.permissionRules, "teamDefault") ||
    !Array.isArray(rule.permissionRules.rules)
  ) {
    return invalidParseResult;
  }
  const defaultGroup = parsePermissionGrant(rule.permissionRules.teamDefault, target.service, true);
  if (!defaultGroup.ok) return invalidParseResult;

  const groups: ConnectionPermissionGroup[] = [];
  const groupsById = new Map<string, ConnectionPermissionGroup>();
  for (const value of rule.permissionRules.rules) {
    if (
      !isPlainObject(value) ||
      !hasOnlyKeys(value, ["id", "name", "actions", "appAccessConfig"]) ||
      !isNonWhitespaceString(value.id) ||
      !isNonWhitespaceString(value.name)
    ) {
      return invalidParseResult;
    }
    const grant = parsePermissionGrant(value, target.service, true, ["id", "name"]);
    if (!grant.ok || groupsById.has(value.id)) return invalidParseResult;
    const group = {
      groupId: value.id,
      name: value.name,
      memberIds: [],
      ...grant.value,
    };
    groups.push(group);
    groupsById.set(group.groupId, group);
  }

  const memberIds = new Set(currentMemberIds);
  if (isPlainObject(rule.permissionRules.assignments)) {
    for (const [memberId, groupId] of Object.entries(rule.permissionRules.assignments)) {
      if (!memberIds.has(memberId) || !isNonWhitespaceString(groupId)) continue;
      groupsById.get(groupId)?.memberIds.push(memberId);
    }
  }
  for (const group of groups) group.memberIds = uniqueSorted(group.memberIds);
  return {
    ok: true,
    value: { sourceFormat: "multi", defaultGroup: defaultGroup.value, groups },
  };
}

function parseLegacyPermissionGroups(
  policy: Record<string, unknown>,
  rule: Record<string, unknown>,
  target: ConnectionPolicyTarget,
  currentMemberIds: readonly string[],
): ParseResult<ConnectionPermissionGroupsState> {
  if (
    !legacyFieldIncludes(rule.method, "POST") ||
    !legacyFieldIncludes(rule.provider, target.service) ||
    (Object.hasOwn(rule, "requireRole") && typeof rule.requireRole !== "boolean")
  ) {
    return invalidParseResult;
  }
  const grant = parsePermissionGrant(rule, target.service, false, ["app", "method", "provider", "requireRole"]);
  if (!grant.ok) return invalidParseResult;
  if (rule.requireRole !== true) {
    return {
      ok: true,
      value: { sourceFormat: "legacy", defaultGroup: grant.value, groups: [] },
    };
  }

  const roleName = getConnectionRoleName(target.appId);
  const memberIds = currentMemberIds.filter((memberId) => {
    const member = policy[`user::${memberId}`];
    return isPlainObject(member) && Array.isArray(member.roles) && member.roles.some((value) => value === roleName);
  });
  return {
    ok: true,
    value: {
      sourceFormat: "legacy",
      defaultGroup: { actionPermission: { mode: "none" } },
      groups: [
        {
          groupId: getLegacyGroupId(target.appId),
          name: "Permission group #1",
          memberIds: uniqueSorted(memberIds),
          ...grant.value,
        },
      ],
    },
  };
}

function parsePermissionGrant(
  value: unknown,
  service: string,
  strict: boolean,
  allowedExtraKeys: readonly string[] = [],
): ParseResult<PermissionGrant> {
  if (!isPlainObject(value)) return invalidParseResult;
  if (strict && !hasOnlyKeys(value, [...allowedExtraKeys, "actions", "appAccessConfig"])) {
    return invalidParseResult;
  }

  let actionPermission: ConnectionActionPermission = { mode: "all" };
  if (Object.hasOwn(value, "actions")) {
    if (!Array.isArray(value.actions)) return invalidParseResult;
    const actionNames: string[] = [];
    const seen = new Set<string>();
    for (const action of value.actions) {
      if (!isNonWhitespaceString(action) || action === "*") return invalidParseResult;
      if (seen.has(action)) {
        if (strict) return invalidParseResult;
        continue;
      }
      seen.add(action);
      actionNames.push(action);
    }
    actionPermission =
      actionNames.length === 0 ? { mode: "none" } : { mode: "selected", actionNames: actionNames.toSorted() };
  }

  let appAccessConfig: JsonObject | undefined;
  if (Object.hasOwn(value, "appAccessConfig")) {
    const parsed = parseAppAccessConfig(value.appAccessConfig, service, strict);
    if (!parsed.ok) return invalidParseResult;
    appAccessConfig = parsed.value;
  }
  const grant: PermissionGrant = { actionPermission };
  if (appAccessConfig !== undefined) grant.appAccessConfig = appAccessConfig;
  return { ok: true, value: grant };
}

function parseAppAccessConfig(value: unknown, service: string, strict: boolean): ParseResult<JsonObject> {
  if (service !== "lingxing" || !isPlainObject(value) || !isJsonObject(value)) {
    return invalidParseResult;
  }
  if (!Object.hasOwn(value, "users")) return { ok: true, value };
  if (!strict) return { ok: true, value: normalizeLegacyLingxingAppAccessConfig(value) };
  if (!Array.isArray(value.users)) return invalidParseResult;
  const users: JsonObject[] = [];
  const seen = new Set<string>();
  for (const item of value.users) {
    if (
      !isPlainObject(item) ||
      !hasOnlyKeys(item, ["uid", "realname", "username"]) ||
      !isNonWhitespaceString(item.uid) ||
      (item.realname !== undefined && !isNonWhitespaceString(item.realname)) ||
      (item.username !== undefined && !isNonWhitespaceString(item.username))
    ) {
      return invalidParseResult;
    }
    const uid = item.uid.trim();
    if (seen.has(uid)) return invalidParseResult;
    seen.add(uid);
    const user: JsonObject = { uid };
    if (item.realname !== undefined) user.realname = item.realname.trim();
    if (item.username !== undefined) user.username = item.username.trim();
    users.push(user);
  }
  return { ok: true, value: { ...value, users } };
}

function normalizeLegacyLingxingAppAccessConfig(value: JsonObject): JsonObject {
  const { users: rawUsers, ...rest } = value;
  if (!Array.isArray(rawUsers)) return rest;
  const users: JsonObject[] = [];
  const seen = new Set<string>();
  for (const item of rawUsers) {
    if (!isPlainObject(item)) continue;
    const uid = normalizeLegacyLingxingUid(item.uid);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const user: JsonObject = { uid };
    if (isNonWhitespaceString(item.realname)) user.realname = item.realname.trim();
    if (isNonWhitespaceString(item.username)) user.username = item.username.trim();
    users.push(user);
  }
  return { ...rest, users };
}

function normalizeLegacyLingxingUid(value: unknown) {
  if (typeof value === "string") {
    const uid = value.trim();
    return uid && uid !== "0" ? uid : undefined;
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value !== 0 ? String(value) : undefined;
}

function buildPermissionGrant(grant: PermissionGrant) {
  const result: JsonObject = {};
  if (grant.actionPermission.mode !== "all") {
    result.actions = grant.actionPermission.mode === "none" ? [] : uniqueSorted(grant.actionPermission.actionNames);
  }
  if (grant.appAccessConfig !== undefined) result.appAccessConfig = structuredClone(grant.appAccessConfig);
  return result;
}

function normalizeActionPermission(permission: ConnectionActionPermission) {
  return permission.mode === "selected"
    ? ({ mode: "selected", actionNames: uniqueSorted(permission.actionNames) } as const)
    : permission;
}

function removeLegacyMemberAssignments(policy: Record<string, unknown>, roleName: string) {
  for (const [subject, value] of Object.entries(policy)) {
    if (!subject.startsWith("user::") || !isPlainObject(value) || !Array.isArray(value.roles)) {
      continue;
    }
    const roles = value.roles.filter((role) => role !== roleName);
    if (roles.length === value.roles.length) continue;
    policy[subject] = { ...value, roles };
  }
}

function getConnectionRoleName(appId: string) {
  return `connector-app:${appId}`;
}

function getLegacyGroupId(appId: string) {
  return `legacy:${appId}`;
}

function uniqueSorted(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].toSorted();
}

function legacyFieldIncludes(value: unknown, expected: string) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

function isNonWhitespaceString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonObject(value: Record<string, unknown>): value is JsonObject {
  return Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isPlainObject(value) && isJsonObject(value);
}
