import { createConnectorRuntime, getConnectorAssetDirectory } from "@oomol-lab/open-connector";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const expected = JSON.parse(process.argv[2]);
const files = await readdir(join(getConnectorAssetDirectory(), "catalog/apps"));
assert.deepEqual(files.filter((name) => name.endsWith(".json")).sort(), expected.map((id) => `${id}.json`).sort());

const runtime = await createConnectorRuntime({
  dataDir: "./data",
  publicOrigin: "https://host.example",
  adminToken: "smoke-admin",
  network: { trustedHosts: ["api.github.com"] },
});
try {
  const response = await runtime.fetch(new Request("https://host.example/v1/providers"));
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.deepEqual(catalog.data.map((provider) => provider.service).sort(), expected);
  if (expected.includes("github")) {
    const originalFetch = globalThis.fetch;
    let hook;
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.hostname !== "api.github.com") throw new Error(`Unexpected provider host ${url.hostname}`);
      if (url.pathname === "/user") return Response.json({ id: 1, login: "fixture-account" });
      const method = init?.method ?? "GET";
      if (method === "POST") {
        hook = { ...JSON.parse(init.body), id: 7 };
        return Response.json(hook, { status: 201 });
      }
      if (method === "PATCH") return Response.json({ ...hook, ...JSON.parse(init.body) });
      if (method === "DELETE") {
        hook = undefined;
        return new Response(null, { status: 204 });
      }
      return Response.json(hook ? [hook] : []);
    };
    try {
      const adminHeaders = { authorization: "Bearer smoke-admin", "content-type": "application/json" };
      const connection = await runtime.fetch(
        new Request("https://host.example/v1/connections/github/connect/api-key", {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({ apiKey: "fixture-secret" }),
        }),
      );
      assert.equal(connection.status, 200, await connection.clone().text());
      const id = (await connection.json()).data.id;
      const grant = await runtime.fetch(
        new Request("https://host.example/api/runtime-tokens", {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({
            name: "trigger-smoke",
            allowedActions: [],
            blockedActions: ["*"],
            allowedProxies: [],
            allowedTriggers: ["github.on_repo_event"],
            allowedConnections: [id],
          }),
        }),
      );
      assert.equal(grant.status, 200, await grant.clone().text());
      const token = (await grant.json()).token;
      const result = await runtime.fetch(
        new Request("https://host.example/v1/providers/github/triggers/github.on_repo_event/execute", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "x-oo-connector-app-id": id,
          },
          body: JSON.stringify({
            operation: "reconcile",
            config: { owner: "fixture-account", repo: "repository", events: ["issues"] },
            endpointUrl: "https://callback.example/hook",
            active: true,
            requestKey: "fixture-binding",
          }),
        }),
      );
      assert.equal(result.status, 200);
      const state = (await result.json()).data;
      assert.equal(state.outcome, "ready");
      assert.deepEqual(Object.keys(state.subscription), ["id"]);
      const cancelled = await runtime.fetch(
        new Request(
          `https://host.example/api/trigger-subscriptions/${encodeURIComponent(state.subscription.id)}/cancel`,
          { method: "POST", headers: adminHeaders },
        ),
      );
      assert.equal(cancelled.status, 200);
      assert.equal(hook, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
} finally {
  await runtime.close();
}
