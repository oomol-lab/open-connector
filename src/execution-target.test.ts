import type { ConnectionSummary, ResolvedConnection } from "./connection-service.ts";

import { expect, it, vi } from "vitest";
import { ActionPolicyService } from "./core/action-policy.ts";
import { resolveExecutionTarget } from "./execution-target.ts";

const account: ConnectionSummary = {
  id: "account",
  service: "example",
  connectionName: "work",
  authType: "api_key",
  configured: true,
  virtual: false,
  default: false,
  profile: { accountId: "user", displayName: "User", grantedScopes: [] },
};
const policy = new ActionPolicyService().createSnapshot(undefined, {
  allowedActions: ["*"],
  blockedActions: [],
  allowedProxies: ["*"],
  allowedConnections: [account.id],
});

it.each(["action", "proxy", "trigger"] as const)(
  "rejects an ungranted %s connection before refreshing credentials",
  async (operation) => {
    const connections = {
      getConnectionSummary: async () => ({ ...account, id: "other" }),
      resolveConnection: vi.fn<() => Promise<ResolvedConnection>>(),
    };
    await expect(resolveExecutionTarget({ connections, service: "example", operation, policy })).rejects.toMatchObject({
      code: "connection_not_allowed",
      kind: "forbidden",
    });
    expect(connections.resolveConnection).not.toHaveBeenCalled();
  },
);

it.each(["action", "proxy", "trigger"] as const)(
  "rechecks the final %s account after credential resolution",
  async (operation) => {
    const connections = {
      getConnectionSummary: async () => account,
      resolveConnection: async (): Promise<ResolvedConnection> => ({
        source: "local",
        summary: { ...account, id: "other" },
      }),
    };
    await expect(resolveExecutionTarget({ connections, service: "example", operation, policy })).rejects.toMatchObject({
      code: "connection_not_allowed",
      kind: "forbidden",
    });
  },
);

it("binds a local credential to the selected service", async () => {
  const credential = {
    authType: "api_key" as const,
    apiKey: "key",
    values: {},
    profile: account.profile,
    metadata: {},
  };
  const target = await resolveExecutionTarget({
    service: "example",
    operation: "trigger",
    policy,
    connections: {
      getConnectionSummary: async () => account,
      resolveConnection: async () => ({ source: "local", summary: account, credential }),
    },
  });
  expect(await target.getCredential("example")).toBe(credential);
  expect(await target.getCredential("other")).toBeUndefined();
});

it.each(["proxy", "trigger"] as const)("rejects the final Marketplace source for %s", async (operation) => {
  await expect(
    resolveExecutionTarget({
      service: "example",
      operation,
      policy,
      connections: {
        getConnectionSummary: async () => account,
        resolveConnection: async () => ({ source: "marketplace", summary: account }),
      },
    }),
  ).rejects.toMatchObject({ kind: "unsupported" });
});
