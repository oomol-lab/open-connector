import type { CustomProvider } from "../provider.ts";
import type { PollDefinition } from "../triggers/common/poll.ts";
import type { ConnectorRuntime, ConnectorRuntimeOptions } from "./connector-runtime.ts";

import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { s } from "../core/json-schema.ts";
import { defineProviderAction } from "../core/provider-definition.ts";
import { defineProviderProxy } from "../providers/provider-proxy.ts";
import { providerFetch } from "../providers/provider-runtime.ts";
import { createConnectorRuntime } from "./connector-runtime.ts";

const publicOrigin = "https://host.example";
const directories: string[] = [];
let runtime: ConnectorRuntime | undefined;

afterEach(async () => {
  await runtime?.close();
  runtime = undefined;
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const greet = defineProviderAction("customgreet", {
  name: "greet",
  description: "Greet someone.",
  operationType: "read",
  inputSchema: s.requiredObject("Greeting input.", { name: s.nonEmptyString("Who to greet.") }),
  outputSchema: s.object("Greeting output.", { greeting: s.string("The greeting.") }),
});

const whoami = defineProviderAction("customkeyed", {
  name: "whoami",
  description: "Return the stored API key length.",
  operationType: "read",
  inputSchema: s.object("No input.", {}),
  outputSchema: s.object("Key info.", { keyLength: s.number("Length of the stored API key.") }),
});

const customGreet: CustomProvider = {
  definition: {
    service: "customgreet",
    displayName: "Custom Greeter",
    categories: ["Productivity"],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions: [greet],
  },
  load: async () => ({
    executors: {
      "customgreet.greet": async (input) => ({
        ok: true,
        output: { greeting: `Hello, ${(input as { name: string }).name}!` },
      }),
    },
  }),
};

const customKeyed: CustomProvider = {
  definition: {
    service: "customkeyed",
    displayName: "Custom Keyed",
    categories: ["Productivity"],
    authTypes: ["api_key"],
    auth: [{ type: "api_key", label: "API Key" }],
    actions: [whoami],
  },
  load: async () => ({
    credentialValidators: {
      async apiKey(input) {
        if (input.apiKey === "bad") throw new Error("rejected");
      },
    },
    executors: {
      "customkeyed.whoami": async (_input, context) => {
        const credential = await context.getCredential("customkeyed");
        if (credential?.authType !== "api_key")
          return { ok: false, error: { code: "missing_credential", message: "no key" } };
        return { ok: true, output: { keyLength: credential.apiKey.length } };
      },
    },
  }),
};

describe("custom-registered providers", () => {
  it("lists and executes a no-auth provider from the host next to bundled ones", async () => {
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [customGreet] });
    const actions = (await (await call("/v1/actions?service=customgreet", undefined, "runtime-token")).json()).data;
    expect(JSON.stringify(actions)).toContain("customgreet.greet");
    const bundled = (await (await call("/v1/actions?service=github", undefined, "runtime-token")).json()).data;
    expect(JSON.stringify(bundled)).toContain("github.");
    const response = await call("/v1/actions/customgreet.greet", { input: { name: "Ada" } }, "runtime-token");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ greeting: "Hello, Ada!" });
    const invalid = await call("/v1/actions/customgreet.greet", { input: {} }, "runtime-token");
    expect(invalid.status).toBe(400);
  });

  it("connects an api_key provider from the host, validates the key and executes with the stored credential", async () => {
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [customKeyed] });
    const rejected = await call("/v1/connections/customkeyed/connect/api-key", { apiKey: "bad" });
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    const connected = await call("/v1/connections/customkeyed/connect/api-key", { apiKey: "secret-key" });
    expect(connected.status).toBe(200);
    const apps = (await (await call("/v1/apps", undefined, "runtime-token")).json()).data;
    const alias = apps.find((app: { service: string }) => app.service === "customkeyed").alias;
    const response = await call("/v1/actions/customkeyed.whoami", { input: {} }, "runtime-token", alias);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ keyLength: 10 });
  });

  it("answers the authenticated proxy of a custom provider with the connection's credential", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ contacts: [] }));
    vi.stubGlobal("fetch", fetcher);
    const withProxy: CustomProvider = {
      ...customKeyed,
      load: async () => ({
        ...(await customKeyed.load()),
        proxy: defineProviderProxy({
          service: "customkeyed",
          baseUrl: "https://api.custom.example",
          auth: { type: "bearer" },
        }),
      }),
    };
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [withProxy] });
    await call("/v1/connections/customkeyed/connect/api-key", { apiKey: "secret-key" });
    const alias = (await (await call("/v1/apps", undefined, "runtime-token")).json()).data[0].alias;
    const response = await call(
      "/v1/proxy/customkeyed",
      { endpoint: "/contacts", method: "GET", query: { limit: 2 } },
      "runtime-token",
      alias,
    );
    expect(response.status).toBe(200);
    const [url, init] = fetcher.mock.calls.at(-1)!;
    expect(String(url)).toBe("https://api.custom.example/contacts?limit=2");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-key");
  });

  it("rejects a custom provider that shadows a bundled service or duplicates another custom provider", async () => {
    const shadow: CustomProvider = {
      ...customGreet,
      definition: { ...customGreet.definition, service: "github", actions: [] },
    };
    await expect(createConnectorRuntime({ ...(await fixture()), customProviders: [shadow] })).rejects.toThrow(
      "Provider service already registered: github",
    );
    await expect(
      createConnectorRuntime({ ...(await fixture()), customProviders: [customGreet, customGreet] }),
    ).rejects.toThrow("Provider service already registered: customgreet");
  });

  it("rejects an action that does not belong to its provider", async () => {
    const stray: CustomProvider = {
      ...customGreet,
      definition: { ...customGreet.definition, actions: [{ ...greet, id: "other.greet", service: "other" }] },
    };
    await expect(createConnectorRuntime({ ...(await fixture()), customProviders: [stray] })).rejects.toThrow(
      "other.greet",
    );
  });
});

const pollSnapshot: PollDefinition["snapshot"] = {
  configInputs: [],
  definitionVersion: 1,
  description: "Triggers when a new item appears.",
  displayName: "New Item",
  key: "custompoll.on_new_item",
  name: "on_new_item",
  outputs: [{ handle: "events", jsonSchema: { type: "array" }, nullable: false }],
  provider: "custompoll",
  type: "poll",
};

const customPoll: CustomProvider = {
  definition: {
    service: "custompoll",
    displayName: "Host Poller",
    categories: ["Productivity"],
    authTypes: ["api_key"],
    auth: [{ type: "api_key", label: "API Key" }],
    actions: [],
    triggers: [pollSnapshot],
    triggerPermissions: [
      {
        id: "custompoll.on_new_item",
        name: "New Item",
        description: "Polls the item list.",
        providerPermissions: [],
        instructions: "Any API key.",
      },
    ],
  },
  load: async () => ({
    executors: {},
    // The provider API: items 1..3 exist, and the poll reads them through the runtime's connection proxy.
    proxy: async (request) => {
      const response = await providerFetch(`https://8.8.8.8${request.endpoint}?after=${request.query?.after ?? 0}`);
      return { ok: true, response: { status: response.status, headers: {}, data: await response.json() } };
    },
    triggers: [
      {
        snapshot: pollSnapshot,
        buildOutputs: (events) => ({ events: events.map((event) => event.payload) }),
        poll: async ({ checkpoint, connector }) => {
          const after = typeof checkpoint === "number" ? checkpoint : 0;
          const result = await connector.execute({ method: "GET", endpoint: "/items", query: { after } });
          const items = result.data as { id: number }[];
          return {
            checkpoint: items.at(-1)?.id ?? after,
            events: items.map((item) => ({ dedupeKey: `item-${item.id}`, payload: { id: item.id } })),
          };
        },
      },
    ],
  }),
};

describe("custom provider poll triggers", () => {
  it("lists a host poll trigger and polls it end to end through the connection proxy, with dispatch applied", async () => {
    // The custom provider's API: items 1..3 exist.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const after = Number(new URL(String(input)).searchParams.get("after"));
        return Response.json([1, 2, 3].map((id) => ({ id })).filter((item) => item.id > after));
      }),
    );
    const attempts: { service?: string; operation: string }[] = [];
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      customProviders: [customPoll],
      providerHttpDispatch: {
        beforeAttempt: (attempt) => {
          attempts.push({ service: attempt.context.service, operation: attempt.context.operation });
          return { allow: true };
        },
      },
    });
    expect((await call("/v1/connections/custompoll/connect/api-key", { apiKey: "key" })).status).toBe(200);
    const alias = (
      (await (await call("/v1/apps", undefined, "runtime-token")).json()).data as { service: string; alias: string }[]
    ).find((app) => app.service === "custompoll")!.alias;

    const permissions = await call("/v1/providers/custompoll/trigger-permissions", undefined, "runtime-token");
    expect(JSON.stringify(await permissions.json())).toContain("custompoll.on_new_item");

    const poll = (checkpoint: unknown) =>
      runtime!.fetch(
        new Request(`${publicOrigin}/v1/providers/custompoll/triggers/custompoll.on_new_item/execute`, {
          method: "POST",
          headers: {
            "authorization": "Bearer runtime-token",
            "content-type": "application/json",
            "x-oo-connector-alias": alias,
          },
          body: JSON.stringify({ operation: "read", config: {}, checkpoint }),
        }),
      );
    const first = await poll(null);
    expect(first.status).toBe(200);
    const firstData = (await first.json()).data;
    expect(firstData.checkpoint).toBe(3);
    expect(firstData.events.map((event: { dedupeKey: string }) => event.dedupeKey)).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ]);

    // The next poll resumes from the checkpoint and finds nothing new.
    const second = (await (await poll(3)).json()).data;
    expect(second.events).toEqual([]);
    expect(second.checkpoint).toBe(3);

    // Dispatch saw each poll's provider call, tagged with the host service and the trigger operation.
    expect(
      attempts.filter((attempt) => attempt.service === "custompoll" && attempt.operation === "trigger"),
    ).toHaveLength(2);
  });
});

describe("custom provider trigger policy", () => {
  it("blocks a host poll trigger by policy before it reaches the provider", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json([]));
    vi.stubGlobal("fetch", fetcher);
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      customProviders: [customPoll],
      actionPolicy: { blockedTriggers: ["custompoll.on_new_item"] },
    });
    expect((await call("/v1/connections/custompoll/connect/api-key", { apiKey: "key" })).status).toBe(200);
    const alias = (
      (await (await call("/v1/apps", undefined, "runtime-token")).json()).data as { service: string; alias: string }[]
    ).find((app) => app.service === "custompoll")!.alias;
    const response = await runtime.fetch(
      new Request(`${publicOrigin}/v1/providers/custompoll/triggers/custompoll.on_new_item/execute`, {
        method: "POST",
        headers: {
          "authorization": "Bearer runtime-token",
          "content-type": "application/json",
          "x-oo-connector-alias": alias,
        },
        body: JSON.stringify({ operation: "read", config: {}, checkpoint: null }),
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe("trigger_blocked");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("custom provider registration checks", () => {
  it("accepts a readonly provider list", async () => {
    const providers: readonly CustomProvider[] = [customGreet];
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: providers });
    expect((await call("/v1/actions/customgreet.greet", { input: { name: "Ada" } }, "runtime-token")).status).toBe(200);
  });

  it("keeps the provider list passed at creation when the host changes its array later", async () => {
    const providers = [customGreet];
    const created = createConnectorRuntime({ ...(await fixture()), customProviders: providers });
    providers.length = 0;
    runtime = await created;
    const listed = (await (await call("/v1/actions?service=customgreet", undefined, "runtime-token")).json()).data;
    expect(JSON.stringify(listed)).toContain("customgreet.greet");
    expect((await call("/v1/actions/customgreet.greet", { input: { name: "Ada" } }, "runtime-token")).status).toBe(200);
  });

  it("lists and executes a custom provider with eager schemas", async () => {
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      lazySchemas: false,
      customProviders: [customGreet],
    });
    const listed = (await (await call("/v1/actions?service=customgreet", undefined, "runtime-token")).json()).data;
    expect(JSON.stringify(listed)).toContain("customgreet.greet");
    const response = await call("/v1/actions/customgreet.greet", { input: { name: "Ada" } }, "runtime-token");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ greeting: "Hello, Ada!" });
  });

  it("rejects an action whose id or service names another provider", async () => {
    const wrongService: CustomProvider = {
      ...customGreet,
      definition: { ...customGreet.definition, actions: [{ ...greet, service: "other" }] },
    };
    await expect(createConnectorRuntime({ ...(await fixture()), customProviders: [wrongService] })).rejects.toThrow(
      "customgreet.greet",
    );
    const wrongId: CustomProvider = {
      ...customGreet,
      definition: { ...customGreet.definition, actions: [{ ...greet, id: "other.greet" }] },
    };
    await expect(createConnectorRuntime({ ...(await fixture()), customProviders: [wrongId] })).rejects.toThrow(
      "other.greet",
    );
  });

  it("rejects an invalid or reserved service id", async () => {
    for (const service of ["Bad.Id", "__proto__", "constructor", "prototype"]) {
      const provider: CustomProvider = {
        ...customGreet,
        definition: { ...customGreet.definition, service, actions: [] },
      };
      await expect(createConnectorRuntime({ ...(await fixture()), customProviders: [provider] })).rejects.toThrow(
        service,
      );
    }
    expect(Object.prototype).not.toHaveProperty("executors");
  });

  it("rejects a service that is only in the catalog directory and has no executor", async () => {
    const options = await fixture();
    const catalogOnly = { ...customGreet.definition, service: "catalogonly", actions: [] };
    await writeFile(join(options.assets!.catalogDir, "catalogonly.json"), JSON.stringify(catalogOnly));
    const shadow: CustomProvider = { ...customGreet, definition: catalogOnly };
    await expect(createConnectorRuntime({ ...options, customProviders: [shadow] })).rejects.toThrow("catalogonly");
  });

  it("rejects a repeated action id within one provider", async () => {
    const repeated: CustomProvider = {
      ...customGreet,
      definition: { ...customGreet.definition, actions: [greet, greet] },
    };
    await expect(createConnectorRuntime({ ...(await fixture()), customProviders: [repeated] })).rejects.toThrow(
      "customgreet.greet",
    );
  });

  it("rejects trigger keys and trigger permissions outside the provider's service", async () => {
    const foreignTrigger: CustomProvider = {
      ...customPoll,
      definition: { ...customPoll.definition, triggers: [{ ...pollSnapshot, key: "github.on_x" }] },
    };
    await expect(createConnectorRuntime({ ...(await fixture()), customProviders: [foreignTrigger] })).rejects.toThrow(
      "github.on_x",
    );
    const foreignPermission: CustomProvider = {
      ...customPoll,
      definition: {
        ...customPoll.definition,
        triggerPermissions: [{ ...customPoll.definition.triggerPermissions![0]!, id: "github.on_x" }],
      },
    };
    await expect(
      createConnectorRuntime({ ...(await fixture()), customProviders: [foreignPermission] }),
    ).rejects.toThrow("github.on_x");
  });

  it("refuses a module trigger keyed outside the provider's service when the module loads", async () => {
    const foreignModule: CustomProvider = {
      ...customPoll,
      load: async () => {
        const module = await customPoll.load();
        const [poll] = module.triggers as PollDefinition[];
        return { ...module, triggers: [{ ...poll!, snapshot: { ...poll!.snapshot, key: "github.on_x" } }] };
      },
    };
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      customProviders: [foreignModule],
      actionPolicy: { allowedTriggers: ["github.*"] },
    });
    // Connecting loads the module for its credential validators, and the load is refused.
    const connected = await call("/v1/connections/custompoll/connect/api-key", { apiKey: "key" });
    expect(connected.status).toBe(500);
  });

  it("loads a custom provider module once on first use and retries after a failed load", async () => {
    const module = await customGreet.load();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const load = vi.fn(async () => {
      await pending;
      return module;
    });
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [{ ...customGreet, load }] });
    await call("/v1/providers", undefined, "runtime-token");
    await call("/v1/actions?service=customgreet", undefined, "runtime-token");
    await call("/v1/actions/customgreet.greet", undefined, "runtime-token");
    expect(load).not.toHaveBeenCalled();
    const execute = () => call("/v1/actions/customgreet.greet", { input: { name: "Ada" } }, "runtime-token");
    // Both first uses start while the load is still pending and share it.
    const first = execute();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const second = execute();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(load).toHaveBeenCalledTimes(1);
    release();
    expect((await Promise.all([first, second])).map((response) => response.status)).toEqual([200, 200]);
    expect((await execute()).status).toBe(200);
    expect(load).toHaveBeenCalledTimes(1);
    await runtime.close();

    const flaky = vi
      .fn<() => Promise<typeof module>>()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(module);
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      customProviders: [{ ...customGreet, load: flaky }],
    });
    expect((await execute()).status).not.toBe(200);
    expect((await execute()).status).toBe(200);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it("refuses to start when a stored custom MCP provider uses a host provider's service id", async () => {
    const options = await fixture();
    runtime = await createConnectorRuntime(options);
    const created = await call("/api/custom-mcp", {
      service: "invsvc",
      displayName: "Inventory MCP",
      endpoint: "https://mcp.example.com/mcp",
      auth: { type: "headers", headers: [{ name: "Authorization", prefix: "Bearer " }] },
    });
    expect(created.status).toBe(201);
    await runtime.close();
    runtime = undefined;
    const host: CustomProvider = {
      ...customGreet,
      definition: { ...customGreet.definition, service: "invsvc", actions: [] },
    };
    await expect(createConnectorRuntime({ ...options, customProviders: [host] })).rejects.toThrow(
      /custom MCP.*invsvc|invsvc.*custom MCP/i,
    );
  });
});

const fetchAction = defineProviderAction("customfetch", {
  name: "ping",
  description: "Call the provider API.",
  operationType: "read",
  inputSchema: s.object("No input.", {}),
  outputSchema: s.object("Ping output.", { status: s.number("HTTP status.") }),
});

const customFetch: CustomProvider = {
  definition: {
    service: "customfetch",
    displayName: "Host Fetcher",
    categories: ["Developer Tools"],
    authTypes: ["no_auth"],
    auth: [{ type: "no_auth" }],
    actions: [fetchAction],
  },
  load: async () => ({
    executors: {
      "customfetch.ping": async () => {
        const response = await providerFetch("https://8.8.8.8/ping");
        return { ok: true, output: { status: response.status } };
      },
    },
  }),
};

const customOAuth: CustomProvider = {
  definition: {
    service: "customoauth",
    displayName: "Host OAuth",
    categories: ["Productivity"],
    authTypes: ["oauth2"],
    auth: [
      {
        type: "oauth2",
        authorizationUrl: "https://auth.host.example/authorize",
        tokenUrl: "https://auth.host.example/token",
        scopes: ["read"],
        requiredScopes: ["read"],
        tokenEndpointAuthMethod: "client_secret_post",
      },
    ],
    actions: [defineProviderAction("customoauth", { ...greetBase("customoauth") })],
  },
  load: async () => ({ executors: { "customoauth.greet": async () => ({ ok: true, output: { greeting: "hi" } }) } }),
};

function greetBase(_service: string) {
  return {
    name: "greet",
    description: "Greet someone.",
    operationType: "read" as const,
    inputSchema: s.object("No input.", {}),
    outputSchema: s.object("Greeting output.", { greeting: s.string("The greeting.") }),
  };
}

describe("custom providers are first-class", () => {
  it("is listed, filterable and searchable like a bundled provider", async () => {
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [customGreet, customKeyed] });
    const all = (await (await call("/v1/providers", undefined, "runtime-token")).json()).data;
    expect(all.map((provider: { service: string }) => provider.service)).toEqual(
      expect.arrayContaining(["github", "customgreet", "customkeyed"]),
    );
    const byService = (await (await call("/v1/providers?service=customgreet", undefined, "runtime-token")).json()).data;
    expect(byService.map((provider: { service: string }) => provider.service)).toEqual(["customgreet"]);
    const byName = (await (await call("/v1/providers?q=greeter", undefined, "runtime-token")).json()).data;
    expect(byName.map((provider: { service: string }) => provider.service)).toEqual(["customgreet"]);
    const byAuth = (await (await call("/v1/providers?q=api_key", undefined, "runtime-token")).json()).data;
    expect(byAuth.map((provider: { service: string }) => provider.service)).toContain("customkeyed");
    const setup = (await (await call("/v1/providers/customkeyed/setup")).json()).data;
    expect(JSON.stringify(setup)).toContain("api_key");
    const search = (await (await call("/v1/actions/search?q=greet", undefined, "runtime-token")).json()).data;
    expect(search.map((hit: { id: string }) => hit.id)).toContain("customgreet.greet");
    const detail = await call("/v1/actions/customgreet.greet", undefined, "runtime-token");
    expect(detail.status).toBe(200);
    expect(JSON.stringify((await detail.json()).data)).toContain("Who to greet.");
    const admin = await (await call("/api/providers")).json();
    expect(JSON.stringify(admin)).toContain("customgreet");
    const adminActions = await (await call("/api/actions")).json();
    expect(JSON.stringify(adminActions)).toContain("customgreet.greet");
  });

  it("reports oauth2 setup for a custom provider and accepts its client config", async () => {
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [customOAuth] });
    const setup = (await (await call("/v1/providers/customoauth/setup")).json()).data;
    expect(JSON.stringify(setup)).toContain("oauth2");
    const put = await runtime.fetch(
      new Request(`${publicOrigin}/api/oauth/configs/customoauth`, {
        method: "PUT",
        headers: { "authorization": "Bearer admin-token", "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client", clientSecret: "secret" }),
      }),
    );
    expect(put.status).toBe(200);
    const started = await call("/api/oauth/connection-requests", { service: "customoauth", connectionName: "main" });
    expect(started.status).toBe(200);
    expect(JSON.stringify(await started.json())).toContain("https://auth.host.example/authorize");
  });

  it("sends custom provider requests through providerHttpDispatch with runtime identity", async () => {
    const attempts: { service?: string; actionId?: string; operation: string }[] = [];
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      customProviders: [customFetch],
      providerHttpDispatch: {
        beforeAttempt: (attempt) => {
          attempts.push({
            service: attempt.context.service,
            actionId: attempt.context.actionId,
            operation: attempt.context.operation,
          });
          return { allow: false, retryAfterSeconds: 7 };
        },
      },
    });
    const response = await call("/v1/actions/customfetch.ping", { input: {} }, "runtime-token");
    expect(response.status).not.toBe(200);
    expect(attempts).toEqual([{ service: "customfetch", actionId: "customfetch.ping", operation: "action" }]);
  });

  it("applies actionPolicy to custom provider actions by id and wildcard", async () => {
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      customProviders: [customGreet],
      actionPolicy: { blockedActions: ["customgreet.*"] },
    });
    const blocked = await call("/v1/actions/customgreet.greet", { input: { name: "x" } }, "runtime-token");
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).errorCode).toBe("action_blocked");
    await runtime.close();
    runtime = await createConnectorRuntime({
      ...(await fixture()),
      customProviders: [customGreet],
      actionPolicy: { allowedActions: ["github.*"] },
    });
    const notAllowed = await call("/v1/actions/customgreet.greet", { input: { name: "x" } }, "runtime-token");
    expect(notAllowed.status).toBe(400);
    expect((await notAllowed.json()).errorCode).toBe("action_not_allowed");
  });

  it("blocks private network targets from custom provider requests", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
    vi.stubGlobal("fetch", fetcher);
    const privateTarget: CustomProvider = {
      ...customFetch,
      load: async () => ({
        executors: {
          "customfetch.ping": async () => {
            try {
              const response = await providerFetch("http://127.0.0.1:8080/ping");
              return { ok: true, output: { status: response.status } };
            } catch (error) {
              return { ok: false, error: { code: "blocked", message: (error as Error).message } };
            }
          },
        },
      }),
    };
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [privateTarget] });
    const response = await call("/v1/actions/customfetch.ping", { input: {} }, "runtime-token");
    expect(response.status).not.toBe(200);
    expect((await response.json()).message).toContain("must not target");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("confines custom provider connections to their scope and applies runtime token grants", async () => {
    runtime = await createConnectorRuntime({ ...(await fixture()), customProviders: [customKeyed] });
    const connect = async (scope: string) => {
      const response = await call("/v1/connections/customkeyed/connect/api-key", { apiKey: `key-${scope}`, scope });
      expect(response.status).toBe(200);
      return (await response.json()).data.alias as string;
    };
    const token = async (extra: Record<string, unknown>) => {
      const body = { name: "test", allowedActions: [], blockedActions: [], allowedProxies: [], allowedConnections: [] };
      const response = await call("/api/runtime-tokens", { ...body, ...extra });
      expect(response.status).toBe(200);
      return (await response.json()).token as string;
    };
    const aliasA = await connect("tenant-a");
    const aliasB = await connect("tenant-b");
    const tokenA = await token({ scope: "tenant-a" });

    const apps = (await (await call("/v1/apps", undefined, tokenA)).json()).data as { alias: string }[];
    expect(apps.map((app) => app.alias)).toEqual([aliasA]);
    const own = await call("/v1/actions/customkeyed.whoami", { input: {} }, tokenA, aliasA);
    expect(own.status).toBe(200);
    expect((await own.json()).data).toEqual({ keyLength: "key-tenant-a".length });
    const cross = await call("/v1/actions/customkeyed.whoami", { input: {} }, tokenA, aliasB);
    expect(cross.status).toBe(404);

    const narrowed = await token({ scope: "tenant-a", allowedActions: ["github.*"] });
    const denied = await call("/v1/actions/customkeyed.whoami", { input: {} }, narrowed, aliasA);
    expect(denied.status).toBe(400);
    expect((await denied.json()).errorCode).toBe("action_not_allowed");
  });
});

async function fixture(): Promise<ConnectorRuntimeOptions> {
  const root = await mkdtemp(join(tmpdir(), "open-connector-custom-providers-"));
  directories.push(root);
  const catalogDir = join(root, "catalog");
  await mkdir(catalogDir);
  await cp(resolve(import.meta.dirname, "../../catalog/apps/github.json"), join(catalogDir, "github.json"));
  return {
    dataDir: join(root, "state"),
    publicOrigin,
    encryptionKey: "fixture-encryption-key",
    adminToken: "admin-token",
    runtimeToken: "runtime-token",
    assets: { catalogDir, migrationDirectory: resolve(import.meta.dirname, "../../migrations") },
  };
}

function call(path: string, body?: unknown, token = "admin-token", alias?: string): Promise<Response> {
  return runtime!.fetch(
    new Request(`${publicOrigin}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        ...(alias ? { "x-oo-connector-alias": alias } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
