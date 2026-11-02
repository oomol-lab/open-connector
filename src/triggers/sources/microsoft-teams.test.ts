import type { IntegrationReceiveContext } from "../common/integration.ts";
import type { JsonValue } from "../common/json.ts";
import type { PersistentSourceRequest, SourceApplication, SourceApplicationStore } from "./persistent.ts";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const appId = "00000000-0000-0000-0000-0000000000b0";
const botId = `28:${appId}`;
const serviceUrl = "https://smba.trafficmanager.net/amer/";
const channelId = "19:approvals@thread.tacv2";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const owner = { scope: "token", connectionId: "connection" };
const proxy = {
  providerAccountId: appId,
  execute: async () => {
    throw new Error("Unexpected upstream request");
  },
};

let modules: {
  persistent: typeof import("./persistent.ts");
  trigger: typeof import("../../providers/microsoft_teams_bot/trigger-on-activity.ts");
};

beforeAll(async () => {
  const keys = { keys: [{ ...(await exportJWK(publicKey)), kid: "key-1", endorsements: ["msteams"] }] };
  // Bot Framework's OpenID metadata and key set are served locally; nothing reaches Microsoft.
  vi.stubGlobal("fetch", async (url: string | URL | Request) =>
    Response.json(String(url).endsWith("openidconfiguration") ? { jwks_uri: "https://keys.example/jwks" } : keys),
  );
  vi.resetModules();
  (await import("../../core/guarded-fetch.ts")).setDefaultGuardedFetchDnsLookup(null);
  modules = {
    persistent: await import("./persistent.ts"),
    trigger: await import("../../providers/microsoft_teams_bot/trigger-on-activity.ts"),
  };
});

afterAll(() => {
  vi.unstubAllGlobals();
});

class MemorySourceStore implements SourceApplicationStore {
  private readonly rows = new Map<string, { revision: number; application: SourceApplication }>();

  async getSourceApplication(scope: string, id: string) {
    const row = this.rows.get(JSON.stringify([scope, id]));
    return row ? structuredClone(row) : null;
  }

  async saveSourceApplication(scope: string, id: string, revision: number | null, application: SourceApplication) {
    const key = JSON.stringify([scope, id]);
    if ((this.rows.get(key)?.revision ?? null) !== revision) return false;
    this.rows.set(key, { revision: (revision ?? 0) + 1, application: structuredClone(application) });
    return true;
  }
}

async function botToken(audience = appId): Promise<string> {
  return new SignJWT({ serviceurl: serviceUrl })
    .setProtectedHeader({ alg: "RS256", kid: "key-1" })
    .setIssuer("https://api.botframework.com")
    .setAudience(audience)
    .setExpirationTime("10m")
    .sign(privateKey);
}

function activity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "message",
    id: "1700000000123",
    timestamp: "2026-11-01T10:00:00.000Z",
    serviceUrl,
    channelId: "msteams",
    from: { id: "29:ada", aadObjectId: "aad-ada", name: "Ada" },
    recipient: { id: botId, name: "Approvals Bot" },
    conversation: { id: "a:personal-chat", conversationType: "personal", tenantId: "tenant-1" },
    text: "hello",
    ...overrides,
  };
}

const channelMention = activity({
  id: "1700000000456",
  replyToId: "1700000000000",
  conversation: { id: `${channelId};messageid=1700000000000`, conversationType: "channel", isGroup: true },
  channelData: { tenant: { id: "tenant-1" }, team: { id: "19:team@thread.tacv2" }, channel: { id: channelId } },
  text: "<at>Approvals Bot</at> deploy now, <at>Grace</at> please review",
  entities: [
    { type: "mention", text: "<at>@Approvals Bot</at>", mentioned: { id: botId, name: "Approvals Bot" } },
    { type: "mention", text: "<at>Grace</at>", mentioned: { id: "29:grace", name: "Grace" } },
    { type: "clientInfo", locale: "en-US" },
  ],
});

async function createSource(
  store: SourceApplicationStore,
  eventTypes: string[],
  options: { requestKey?: string; tenantId?: string } = {},
) {
  const run = (request: PersistentSourceRequest) =>
    modules.persistent.executePersistentSource(
      store,
      modules.trigger.microsoftTeamsBotActivities,
      owner,
      request,
      proxy,
      new AbortController().signal,
    );
  const created = (await run({
    action: "create",
    deploymentId: "deployment",
    requestKey: options.requestKey ?? "teams-bot",
    input: options.tenantId === undefined ? { eventTypes } : { eventTypes, tenantId: options.tenantId },
  })) as {
    source: {
      reference: { applicationId: string; sourceId: string };
      ready: boolean;
      view: Record<string, JsonValue>;
    };
  };
  const reference = created.source.reference;
  const receive = async (
    body: Record<string, unknown>,
    consumers: { id: string; config: Record<string, JsonValue> }[],
    token?: string,
  ) =>
    (await run({
      action: "receive",
      deploymentId: "deployment",
      reference,
      consumers,
      headers: { authorization: `Bearer ${token ?? (await botToken())}`, "content-type": "application/json" },
      rawBody: Buffer.from(JSON.stringify(body)).toString("base64"),
    })) as {
      response?: { status: number; body: string };
      event?: { id: string; type: string; matches: string[]; payload: Record<string, JsonValue> };
    };
  return { created, reference, run, receive };
}

describe("Microsoft Teams Bot activity source", () => {
  it("is ready without a handshake and refuses stored secrets", async () => {
    const { created, reference, run } = await createSource(new MemorySourceStore(), ["message"]);
    expect(created.source.ready).toBe(true);
    await expect(
      run({
        action: "update",
        deploymentId: "deployment",
        reference,
        expectedRevision: 1,
        input: { eventTypes: ["message"], signingSecret: "not-used" },
      }),
    ).rejects.toThrow(/Bot Framework tokens/u);
  });

  it("delivers a channel thread mention with the bot mention removed and conversation filters applied", async () => {
    const { receive } = await createSource(new MemorySourceStore(), ["message", "conversationUpdate"]);
    const received = await receive(channelMention, [
      { id: "approvals-channel", config: { eventTypes: ["message"], conversationIds: [channelId] } },
      { id: "other-channel", config: { eventTypes: ["message"], conversationIds: ["19:other@thread.tacv2"] } },
      { id: "membership", config: { eventTypes: ["conversationUpdate"] } },
    ]);

    expect(received.event).toMatchObject({
      id: JSON.stringify([`${channelId};messageid=1700000000000`, "1700000000456"]),
      type: "message",
      matches: ["approvals-channel"],
    });
    expect(received.event?.payload).toMatchObject({
      event: "message",
      activityId: "1700000000456",
      text: "deploy now, Grace please review",
      rawText: "<at>Approvals Bot</at> deploy now, <at>Grace</at> please review",
      mentions: [
        { id: botId, name: "Approvals Bot", isBot: true },
        { id: "29:grace", name: "Grace", isBot: false },
      ],
      from: { id: "29:ada", aadObjectId: "aad-ada", name: "Ada" },
      conversation: {
        id: `${channelId};messageid=1700000000000`,
        conversationType: "channel",
        tenantId: "tenant-1",
      },
      channelData: { team: { id: "19:team@thread.tacv2" }, channel: { id: channelId } },
      replyToId: "1700000000000",
      serviceUrl,
      timestamp: "2026-11-01T10:00:00.000Z",
    });
  });

  it("delivers a direct message unchanged", async () => {
    const { receive } = await createSource(new MemorySourceStore(), ["message"]);
    const received = await receive(activity(), [{ id: "dm", config: { eventTypes: ["message"] } }]);
    expect(received.event?.matches).toEqual(["dm"]);
    expect(received.event?.payload).toMatchObject({
      text: "hello",
      rawText: "hello",
      mentions: [],
      conversation: { id: "a:personal-chat", conversationType: "personal", tenantId: "tenant-1" },
      channelData: null,
      replyToId: null,
    });
  });

  it("acknowledges unsupported and unsubscribed activities without delivering them", async () => {
    const { receive } = await createSource(new MemorySourceStore(), ["message"]);
    const consumers = [{ id: "messages", config: { eventTypes: ["message"] } }];

    expect(await receive(activity({ type: "typing", text: undefined }), consumers)).toMatchObject({
      response: { status: 200, body: "" },
    });
    expect((await receive(activity({ channelId: "webchat" }), consumers)).event).toBeUndefined();
    // The Source does not subscribe to conversation updates, so none reach a consumer.
    const update = await receive(activity({ type: "conversationUpdate", text: undefined }), consumers);
    expect(update.event).toBeUndefined();
    expect(update.response?.status).toBe(200);
  });

  it("keeps the same delivery identity when Bot Framework replays an activity", async () => {
    const { reference, receive } = await createSource(new MemorySourceStore(), ["message"]);
    const consumers = [{ id: "messages", config: { eventTypes: ["message"] } }];
    const first = await receive(channelMention, consumers);
    const replayed = await receive(channelMention, consumers);
    expect(replayed.event?.id).toBe(first.event?.id);

    const config: Record<string, JsonValue> = { sourceId: reference.sourceId, eventTypes: ["message"] };
    const dedupeKeys = [first, replayed].map((delivery) => {
      const result = modules.trigger.microsoftTeamsBotActivities.receive({
        eventSourceId: reference.sourceId,
        config,
        payload: delivery.event!.payload,
      } as IntegrationReceiveContext);
      return "dedupeKey" in result ? result.dedupeKey : undefined;
    });
    expect(dedupeKeys[0]).toBe(first.event?.id);
    expect(dedupeKeys[1]).toBe(dedupeKeys[0]);
  });

  it("delivers an activity only to the Source of its tenant when one bot serves several tenants", async () => {
    const store = new MemorySourceStore();
    const contoso = await createSource(store, ["message"], {
      requestKey: "contoso",
      tenantId: "AAAAAAAA-0000-0000-0000-000000000001",
    });
    const fabrikam = await createSource(store, ["message"], {
      requestKey: "fabrikam",
      tenantId: "bbbbbbbb-0000-0000-0000-000000000002",
    });
    const everyTenant = await createSource(store, ["message"], { requestKey: "every-tenant" });
    expect(contoso.created.source.view.tenantId).toBe("aaaaaaaa-0000-0000-0000-000000000001");
    expect(everyTenant.created.source.view.tenantId).toBeNull();

    const consumers = [{ id: "messages", config: { eventTypes: ["message"] } }];
    const contosoMessage = activity({
      conversation: {
        id: "a:contoso-chat",
        conversationType: "personal",
        tenantId: "aaaaaaaa-0000-0000-0000-000000000001",
      },
    });
    expect((await contoso.receive(contosoMessage, consumers)).event?.matches).toEqual(["messages"]);
    expect(await fabrikam.receive(contosoMessage, consumers)).toMatchObject({ response: { status: 200, body: "" } });
    expect((await everyTenant.receive(contosoMessage, consumers)).event?.matches).toEqual(["messages"]);
    // The tenant may arrive only in channelData, and an activity naming no tenant fails a tenant-limited Source.
    const channelTenant = activity({
      conversation: { id: "19:fabrikam@thread.tacv2", conversationType: "channel" },
      channelData: { tenant: { id: "bbbbbbbb-0000-0000-0000-000000000002" } },
    });
    expect((await fabrikam.receive(channelTenant, consumers)).event?.matches).toEqual(["messages"]);
    const noTenant = activity({ conversation: { id: "a:unknown", conversationType: "personal" } });
    expect((await contoso.receive(noTenant, consumers)).event).toBeUndefined();
  });

  it("routes one bot's messaging endpoint to the Sources of the activity's tenant", async () => {
    const store = new MemorySourceStore();
    const contoso = await createSource(store, ["message"], {
      requestKey: "contoso",
      tenantId: "aaaaaaaa-0000-0000-0000-000000000001",
    });
    const fabrikam = await createSource(store, ["message"], {
      requestKey: "fabrikam",
      tenantId: "bbbbbbbb-0000-0000-0000-000000000002",
    });
    const everyTenant = await createSource(store, ["message"], { requestKey: "every-tenant" });
    // Every Source of the bot shares the application of its App ID, behind the one messaging endpoint.
    const { applicationId } = contoso.reference;
    expect([fabrikam.reference.applicationId, everyTenant.reference.applicationId]).toEqual([
      applicationId,
      applicationId,
    ]);
    const route = async (body: Record<string, unknown>, token?: string) =>
      modules.persistent.routeSourceApplication(
        store,
        modules.trigger.microsoftTeamsBotActivities,
        owner.scope,
        {
          action: "route",
          deploymentId: "deployment",
          applicationId,
          headers: { authorization: `Bearer ${token ?? (await botToken())}`, "content-type": "application/json" },
          rawBody: Buffer.from(JSON.stringify(body)).toString("base64"),
        },
        () => undefined,
        new AbortController().signal,
      );

    const fabrikamMessage = activity({
      conversation: {
        id: "a:fabrikam-chat",
        conversationType: "personal",
        tenantId: "bbbbbbbb-0000-0000-0000-000000000002",
      },
    });
    const routed = await route(fabrikamMessage);
    expect(routed.response).toBeUndefined();
    expect(routed.references).toHaveLength(2);
    expect(routed.references).toEqual(expect.arrayContaining([fabrikam.reference, everyTenant.reference]));
    // Neither an unsupported type nor a type no Source subscribes to returns a reference to receive.
    for (const type of ["typing", "invoke"]) {
      expect(await route(activity({ type, text: undefined }))).toEqual({
        references: [],
        response: { status: 200, body: "", headers: {} },
      });
    }
    expect(await route(fabrikamMessage, await botToken("00000000-0000-0000-0000-0000000000ff"))).toEqual({
      references: [],
      response: { status: 401, body: "", headers: {} },
    });
  });

  it("filters consumers by tenant and exposes card submissions", async () => {
    const { receive } = await createSource(new MemorySourceStore(), ["invoke"]);
    const submit = activity({
      type: "invoke",
      name: "adaptiveCard/action",
      text: undefined,
      value: { action: { type: "Action.Execute", verb: "approve", data: { requestId: "7" } } },
    });
    const received = await receive(submit, [
      { id: "tenant-1", config: { eventTypes: ["invoke"], tenantId: "TENANT-1" } },
      { id: "other-tenant", config: { eventTypes: ["invoke"], tenantId: "00000000-0000-0000-0000-000000000009" } },
    ]);
    expect(received.event?.matches).toEqual(["tenant-1"]);
    expect(received.event?.payload).toMatchObject({
      event: "invoke",
      name: "adaptiveCard/action",
      value: { action: { verb: "approve", data: { requestId: "7" } } },
    });
  });

  it("rejects a token issued for another bot", async () => {
    const { receive } = await createSource(new MemorySourceStore(), ["message"]);
    const rejected = await receive(activity(), [], await botToken("00000000-0000-0000-0000-0000000000ff"));
    expect(rejected).toMatchObject({ response: { status: 401 } });
    expect(rejected.event).toBeUndefined();
  });
});
