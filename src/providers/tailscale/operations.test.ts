import { describe, expect, it } from "vitest";
import { tailscaleOperations, tailscaleUnsupportedOAuthClientOperations } from "./operations.ts";

describe("Tailscale official API coverage", () => {
  it("accounts for all official operations and excludes endpoints unavailable to OAuth clients", () => {
    expect(tailscaleOperations).toHaveLength(82);
    expect(tailscaleUnsupportedOAuthClientOperations).toHaveLength(8);
    expect(tailscaleOperations.length + tailscaleUnsupportedOAuthClientOperations.length).toBe(90);
    expect(new Set(tailscaleOperations.map((operation) => operation.name)).size).toBe(82);
    expect(tailscaleOperations.every((operation) => operation.requiredScopes.length > 0)).toBe(true);
  });
});

const scopesFor = (
  name: string,
  input: Record<string, unknown>,
  granted: readonly string[] = [],
): readonly string[] => {
  const operation = tailscaleOperations.find((candidate) => candidate.name === name);
  if (!operation) throw new Error(`unknown operation ${name}`);
  return operation.resolveScopes?.(input, new Set(granted)) ?? operation.requiredScopes;
};

/**
 * Tailscale refuses to mint a token naming a scope the OAuth client was never granted, so every
 * scope an operation requests must be one this call genuinely needs.
 */
describe("Tailscale token scope narrowing", () => {
  it("asks for only the key scope matching the requested keyType", () => {
    expect(scopesFor("create_key", { key: { keyType: "auth" } })).toEqual(["auth_keys"]);
    expect(scopesFor("create_key", { key: { keyType: "client" } })).toEqual(["oauth_keys"]);
    expect(scopesFor("create_key", { key: { keyType: "federated" } })).toEqual(["federated_keys"]);
    // Tailscale defaults an omitted keyType to "auth".
    expect(scopesFor("create_key", { key: { description: "ci" } })).toEqual(["auth_keys"]);
  });

  it("falls back to the held key scopes when keyType is unrecognized", () => {
    expect(scopesFor("create_key", { key: { keyType: "nonsense" } }, ["auth_keys", "users"])).toEqual(["auth_keys"]);
  });

  it("ignores a keyType naming an inherited property instead of resolving it to a non-scope", () => {
    for (const keyType of ["constructor", "toString", "hasOwnProperty"]) {
      // Every entry must still be a real scope string; a prototype hit would send a stringified function.
      expect(scopesFor("create_key", { key: { keyType } }, ["auth_keys"])).toEqual(["auth_keys"]);
    }
  });

  it("requests only the key families a credential holds where the id does not reveal the type", () => {
    expect(scopesFor("delete_key", { keyId: "k1" }, ["auth_keys"])).toEqual(["auth_keys"]);
    expect(scopesFor("delete_key", { keyId: "k1" }, ["auth_keys", "oauth_keys", "users"])).toEqual([
      "auth_keys",
      "oauth_keys",
    ]);
    expect(scopesFor("update_key", { keyId: "k1" }, ["federated_keys", "devices:core"])).toEqual(["federated_keys"]);
    expect(scopesFor("list_keys", {}, ["auth_keys:read"])).toEqual(["auth_keys:read"]);
  });

  it("treats a write scope as covering its read form, which Tailscale never grants separately", () => {
    // A credential granted `auth_keys` can read auth keys, but the grant records only `auth_keys`.
    // Matching the read form literally would drop the family and 403 on an auth key.
    expect(scopesFor("get_key", { keyId: "k1" }, ["auth_keys"])).toEqual(["auth_keys"]);
    expect(scopesFor("get_key", { keyId: "k1" }, ["auth_keys", "oauth_keys:read"])).toEqual([
      "auth_keys",
      "oauth_keys:read",
    ]);
    expect(scopesFor("get_tailnet_settings", {}, ["feature_settings"])).toEqual(["feature_settings"]);
  });

  it("treats the all scope as granting every scope it stands in for", () => {
    // `all` grants every other scope, so each operation can still narrow to what it actually needs.
    expect(scopesFor("get_key", { keyId: "k1" }, ["all"])).toEqual([
      "api_access_tokens:read",
      "auth_keys:read",
      "oauth_keys:read",
      "federated_keys:read",
    ]);
    // Private-endpoint log streaming must stay reachable for a credential that holds everything.
    expect(scopesFor("set_log_streaming_configuration", { logType: "network", configuration: {} }, ["all"])).toEqual([
      "log_streaming",
      "device_invites",
      "policy_file",
    ]);
  });

  it("treats all:read as granting every read scope but no write scope", () => {
    expect(scopesFor("list_keys", {}, ["all:read"])).toEqual([
      "api_access_tokens:read",
      "auth_keys:read",
      "oauth_keys:read",
      "federated_keys:read",
    ]);
    // Read-only access cannot stand in for the write scopes a mutation needs.
    expect(scopesFor("delete_key", { keyId: "k1" }, ["all:read"])).toEqual([]);
  });

  it("covers every key family a mixed read and write grant can reach", () => {
    // A credential auditing auth keys while managing OAuth clients. Matching literally would keep
    // only auth_keys:read and silently drop every OAuth client from the listing.
    expect(scopesFor("list_keys", {}, ["auth_keys:read", "oauth_keys"])).toEqual(["auth_keys:read", "oauth_keys"]);
    expect(scopesFor("get_key", { keyId: "k1" }, ["auth_keys:read", "oauth_keys"])).toEqual([
      "auth_keys:read",
      "oauth_keys",
    ]);
    expect(scopesFor("get_tailnet_settings", {}, ["feature_settings:read", "logs:network"])).toEqual([
      "feature_settings:read",
      "logs:network",
    ]);
  });

  it("omits scope entirely when the recorded grant cannot narrow the request", () => {
    // An empty result makes the executor drop `scope`, minting a token with whatever the client holds
    // rather than failing closed on an unknown grant.
    expect(scopesFor("delete_key", { keyId: "k1" }, [])).toEqual([]);
    expect(scopesFor("delete_key", { keyId: "k1" }, ["devices:core"])).toEqual([]);
  });

  it("maps each tailnet setting to the scope that governs it", () => {
    expect(scopesFor("update_tailnet_settings", { settings: { devicesApprovalOn: true } })).toEqual([
      "feature_settings",
    ]);
    expect(scopesFor("update_tailnet_settings", { settings: { networkFlowLoggingOn: true } })).toEqual([
      "logs:network",
    ]);
    expect(scopesFor("update_tailnet_settings", { settings: { aclsExternallyManagedOn: true } })).toEqual([
      "policy_file",
    ]);
    expect(scopesFor("update_tailnet_settings", { settings: { httpsEnabled: true } })).toEqual(["networking_settings"]);
    expect(
      scopesFor("update_tailnet_settings", { settings: { devicesApprovalOn: true, networkFlowLoggingOn: true } }),
    ).toEqual(["feature_settings", "logs:network"]);
  });

  it("adds private-endpoint log streaming scopes only when the credential holds them", () => {
    expect(scopesFor("set_log_streaming_configuration", { logType: "network", configuration: {} })).toEqual([
      "log_streaming",
    ]);
    expect(
      scopesFor("set_log_streaming_configuration", { logType: "network", configuration: {} }, [
        "log_streaming",
        "device_invites",
        "policy_file",
      ]),
    ).toEqual(["log_streaming", "device_invites", "policy_file"]);
  });

  it("adds the posture scope to OAuth app writes only when node attributes are declared", () => {
    expect(scopesFor("create_oauth_app", { app: { name: "a" } })).toEqual(["oauth_apps"]);
    expect(scopesFor("create_oauth_app", { app: { name: "a", allowedNodeAttributes: ["custom:x"] } })).toEqual([
      "oauth_apps",
      "devices:posture_attributes",
    ]);
    // Tailscale documents only `oauth_apps` for updates, so the posture scope is never demanded here.
    expect(scopesFor("update_oauth_app", { appId: "a1", app: { allowedNodeAttributes: ["custom:x"] } })).toEqual([
      "oauth_apps",
    ]);
    expect(
      scopesFor("update_oauth_app", { appId: "a1", app: { allowedNodeAttributes: ["custom:x"] } }, [
        "oauth_apps",
        "devices:posture_attributes",
      ]),
    ).toEqual(["oauth_apps", "devices:posture_attributes"]);
  });

  it("never requests a scope the operation does not declare, for any grant shape", () => {
    // A resolver may substitute a declared `x:read` with the `x` the credential actually holds, so
    // that write form is the only addition tolerated beyond the declared permissions.
    const grantShapes = [
      [],
      ["all"],
      ...tailscaleOperations.map((operation) => operation.requiredScopes),
      // The write forms Tailscale grants in place of the read scopes operations declare.
      tailscaleOperations.flatMap((operation) =>
        operation.requiredScopes.map((scope) => (scope.endsWith(":read") ? scope.slice(0, -":read".length) : scope)),
      ),
    ];
    for (const operation of tailscaleOperations) {
      const allowed = new Set([
        ...operation.requiredScopes,
        ...operation.requiredScopes.map((scope) => (scope.endsWith(":read") ? scope.slice(0, -":read".length) : scope)),
      ]);
      for (const shape of grantShapes) {
        const requested = operation.resolveScopes?.({}, new Set(shape)) ?? operation.requiredScopes;
        for (const scope of requested) {
          expect(typeof scope).toBe("string");
          expect([operation.name, scope]).toEqual([operation.name, [...allowed].find((one) => one === scope)]);
        }
      }
    }
  });
});
