import type { ConnectionRecord } from "./model";

import { describe, expect, it } from "vitest";
import { actionRequestBody, initialActionConnectionName, reconcileActionConnectionName } from "./actions-page";

function connection(connectionName: string, defaultConnection = false): ConnectionRecord {
  return {
    id: `connection-${connectionName}`,
    service: "github",
    connectionName,
    authType: "api_key",
    configured: true,
    default: defaultConnection,
    metadata: {},
  };
}

describe("action connection selection", () => {
  it("automatically selects the only usable connection", () => {
    expect(initialActionConnectionName([connection("work")])).toBe("work");
  });

  it("prefers the reserved default connection when several exist", () => {
    expect(initialActionConnectionName([connection("work"), connection("default", true)])).toBe("default");
  });

  it("requires an explicit choice when several connections exist without default", () => {
    expect(initialActionConnectionName([connection("personal"), connection("work")])).toBeUndefined();
  });

  it("reconciles selection when refreshed connections remove or narrow the choices", () => {
    expect(reconcileActionConnectionName("work", [connection("personal"), connection("work")])).toBe("work");
    expect(reconcileActionConnectionName("removed", [connection("work")])).toBe("work");
    expect(reconcileActionConnectionName(undefined, [connection("work")])).toBe("work");
  });

  it("includes an explicitly selected connection in the action request", () => {
    expect(actionRequestBody({ repository: "open-connector" }, "work")).toEqual({
      input: { repository: "open-connector" },
      connectionName: "work",
    });
    expect(actionRequestBody({}, undefined)).toEqual({ input: {} });
  });
});
