import type { IntegrationReceiveContext } from "../common/integration.ts";
import type { JsonValue } from "../common/json.ts";
import type { PersistentSourceRequest, SourceApplication, SourceApplicationStore } from "./persistent.ts";

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { slackBotEvents } from "../../providers/slackbot/trigger-on-event.ts";
import { executePersistentSource, routeSourceApplication } from "./persistent.ts";

const signingSecret = "slack-signing-secret";
const owner = { scope: "token", connectionId: "connection" };
const proxy = {
  providerAccountId: "U0BOT",
  execute: async () => {
    throw new Error("Unexpected upstream request");
  },
};

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

function signedHeaders(body: string, contentType: string, timestamp = Math.floor(Date.now() / 1000)) {
  return {
    "content-type": contentType,
    "x-slack-request-timestamp": String(timestamp),
    "x-slack-signature": `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
  };
}

function interactionBody(payload: object): string {
  return new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
}

const form = "application/x-www-form-urlencoded";

const buttonClick = {
  type: "block_actions",
  token: "legacy-verification-token",
  trigger_id: "13345224609.738474920.8088930838d88f008e0",
  api_app_id: "A0APP",
  team: { id: "T0TEAM", domain: "example" },
  user: { id: "U0APPROVER", username: "approver", team_id: "T0TEAM" },
  container: { type: "message", message_ts: "1700000000.000100", channel_id: "C0CHAN" },
  channel: { id: "C0CHAN", name: "approvals" },
  message: { type: "message", ts: "1700000000.000100", thread_ts: "1699999999.000001", text: "Approve the deploy?" },
  response_url: "https://hooks.slack.com/actions/T0TEAM/1/secret",
  actions: [
    {
      type: "button",
      action_id: "approve",
      block_id: "decision",
      value: "approved",
      text: { type: "plain_text", text: "Approve" },
      action_ts: "1700000001.000200",
    },
    {
      type: "static_select",
      action_id: "reason",
      block_id: "decision",
      selected_option: { text: { type: "plain_text", text: "Looks good" }, value: "ok" },
      action_ts: "1700000001.000300",
    },
  ],
};

const modalSubmission = {
  type: "view_submission",
  token: "legacy-verification-token",
  trigger_id: "13345224609.738474920.submitted",
  api_app_id: "A0APP",
  team: { id: "T0TEAM", domain: "example" },
  user: { id: "U0APPROVER", name: "approver", team_id: "T0TEAM" },
  view: {
    id: "V0VIEW",
    callback_id: "approval-reason",
    private_metadata: "request-7",
    state: { values: { reason: { text: { type: "plain_text_input", value: "Ship it" } } } },
  },
};

async function createSource(store: SourceApplicationStore, eventTypes: string[]) {
  const run = (request: PersistentSourceRequest) =>
    executePersistentSource(store, slackBotEvents, owner, request, proxy, new AbortController().signal);
  const created = (await run({
    action: "create",
    deploymentId: "deployment",
    requestKey: "source",
    input: { appId: "A0APP", workspaceId: "T0TEAM", signingSecret, eventTypes },
  })) as { source: { reference: { applicationId: string; sourceId: string } } };
  const reference = created.source.reference;
  const challenge = JSON.stringify({ type: "url_verification", challenge: "challenge" });
  await run({
    action: "receive",
    deploymentId: "deployment",
    reference,
    consumers: [],
    headers: signedHeaders(challenge, "application/json"),
    rawBody: Buffer.from(challenge).toString("base64"),
  });
  return { reference, run };
}

function route(store: SourceApplicationStore, applicationId: string, headers: Record<string, string>, body: string) {
  return routeSourceApplication(
    store,
    slackBotEvents,
    owner.scope,
    {
      action: "route",
      deploymentId: "deployment",
      applicationId,
      headers,
      rawBody: Buffer.from(body).toString("base64"),
    },
    () => undefined,
    new AbortController().signal,
  );
}

function dedupeKey(sourceId: string, config: Record<string, JsonValue>, payload: JsonValue) {
  const result = slackBotEvents.receive({ eventSourceId: sourceId, config, payload } as IntegrationReceiveContext);
  return "dedupeKey" in result ? result.dedupeKey : undefined;
}

describe("Slack interactivity on the shared application source", () => {
  it("routes a signed button click and normalizes it for subscribed consumers", async () => {
    const store = new MemorySourceStore();
    const { reference, run } = await createSource(store, ["app_mention", "block_actions"]);
    const body = interactionBody(buttonClick);

    expect(await route(store, reference.applicationId, signedHeaders(body, `${form}; charset=utf-8`), body)).toEqual({
      references: [reference],
      response: undefined,
    });
    const received = (await run({
      action: "receive",
      deploymentId: "deployment",
      reference,
      consumers: [
        { id: "approvals", config: { eventTypes: ["block_actions"], channelIds: ["C0CHAN"] } },
        { id: "mentions", config: { eventTypes: ["app_mention"] } },
        { id: "elsewhere", config: { eventTypes: ["block_actions"], channelIds: ["C0OTHER"] } },
      ],
      headers: signedHeaders(body, form),
      rawBody: Buffer.from(body).toString("base64"),
    })) as { event: { id: string; type: string; matches: string[]; payload: Record<string, JsonValue> } };

    expect(received.event).toMatchObject({ id: buttonClick.trigger_id, type: "block_actions", matches: ["approvals"] });
    expect(received.event.payload).toMatchObject({
      event: "block_actions",
      deliveryId: buttonClick.trigger_id,
      appId: "A0APP",
      teamId: "T0TEAM",
      channel: "C0CHAN",
      user: "U0APPROVER",
      text: "Approve the deploy?",
      ts: "1700000000.000100",
      threadTs: "1699999999.000001",
      responseUrl: buttonClick.response_url,
      actions: [
        {
          actionId: "approve",
          blockId: "decision",
          type: "button",
          value: "approved",
          selectedOption: null,
          actionTs: "1700000001.000200",
        },
        {
          actionId: "reason",
          blockId: "decision",
          type: "static_select",
          value: null,
          selectedOption: { value: "ok", text: "Looks good" },
          actionTs: "1700000001.000300",
        },
      ],
      view: null,
    });
    expect(received.event.payload.body).not.toHaveProperty("token");
    expect(received.event.payload.body).toMatchObject({ trigger_id: buttonClick.trigger_id });

    // Slack may deliver the same interaction more than once; the trigger_id keeps the dedupe key stable.
    const config = { sourceId: reference.sourceId, eventTypes: ["block_actions"] };
    expect(dedupeKey(reference.sourceId, config, received.event.payload)).toBe(buttonClick.trigger_id);
    expect(dedupeKey(reference.sourceId, config, structuredClone(received.event.payload))).toBe(buttonClick.trigger_id);
  });

  it("normalizes modal submissions and closes", async () => {
    const store = new MemorySourceStore();
    const { reference, run } = await createSource(store, ["view_submission", "view_closed"]);
    const receive = async (payload: object) => {
      const body = interactionBody(payload);
      return (
        (await run({
          action: "receive",
          deploymentId: "deployment",
          reference,
          consumers: [{ id: "modal", config: { eventTypes: ["view_submission", "view_closed"] } }],
          headers: signedHeaders(body, form),
          rawBody: Buffer.from(body).toString("base64"),
        })) as { event: { id: string; matches: string[]; payload: Record<string, JsonValue> } }
      ).event;
    };

    const submitted = await receive(modalSubmission);
    expect(submitted).toMatchObject({ id: modalSubmission.trigger_id, matches: ["modal"] });
    expect(submitted.payload).toMatchObject({
      event: "view_submission",
      deliveryId: modalSubmission.trigger_id,
      channel: null,
      user: "U0APPROVER",
      text: null,
      ts: null,
      responseUrl: null,
      actions: null,
      view: {
        id: "V0VIEW",
        callbackId: "approval-reason",
        privateMetadata: "request-7",
        state: modalSubmission.view.state.values,
        isCleared: false,
      },
    });

    const { trigger_id: _triggerId, ...closed } = { ...modalSubmission, type: "view_closed", is_cleared: true };
    expect((await receive(closed)).payload).toMatchObject({
      event: "view_closed",
      deliveryId: "view_closed:V0VIEW",
      view: { id: "V0VIEW", isCleared: true },
    });
  });

  it("rejects bad signatures and stale timestamps, and acknowledges interactions it does not route", async () => {
    const store = new MemorySourceStore();
    const { reference } = await createSource(store, ["block_actions"]);
    const body = interactionBody(buttonClick);

    const forged = { ...signedHeaders(body, form), "x-slack-signature": `v0=${"0".repeat(64)}` };
    expect(await route(store, reference.applicationId, forged, body)).toEqual({
      references: [],
      response: { status: 401, body: "", headers: {} },
    });
    const stale = signedHeaders(body, form, Math.floor(Date.now() / 1000) - 301);
    expect((await route(store, reference.applicationId, stale, body)).response?.status).toBe(401);

    const otherWorkspace = interactionBody({ ...buttonClick, team: { id: "T0OTHER", domain: "other" } });
    const shortcut = interactionBody({ ...buttonClick, type: "shortcut" });
    for (const ignored of [otherWorkspace, shortcut, "command=%2Fapprove"]) {
      const result = await route(store, reference.applicationId, signedHeaders(ignored, form), ignored);
      expect(result).toMatchObject({ references: [], response: { status: 200, body: "" } });
    }
  });

  it("still routes Events API bodies on the same callback", async () => {
    const store = new MemorySourceStore();
    const { reference, run } = await createSource(store, ["app_mention", "block_actions"]);
    const body = JSON.stringify({
      type: "event_callback",
      event_id: "Ev0MENTION",
      api_app_id: "A0APP",
      team_id: "T0TEAM",
      authorizations: [{ is_bot: true, user_id: "U0BOT", team_id: "T0TEAM" }],
      event: { type: "app_mention", channel: "C0CHAN", user: "U0USER", text: "<@U0BOT> hi", ts: "1700000002.000100" },
    });
    const headers = signedHeaders(body, "application/json");

    expect((await route(store, reference.applicationId, headers, body)).references).toEqual([reference]);
    const received = (await run({
      action: "receive",
      deploymentId: "deployment",
      reference,
      consumers: [{ id: "mentions", config: { eventTypes: ["app_mention"] } }],
      headers,
      rawBody: Buffer.from(body).toString("base64"),
    })) as { event: { matches: string[]; payload: Record<string, JsonValue> } };
    expect(received.event.matches).toEqual(["mentions"]);
    expect(received.event.payload).toMatchObject({
      event: "app_mention",
      deliveryId: "Ev0MENTION",
      channel: "C0CHAN",
      text: "<@U0BOT> hi",
    });
    expect(received.event.payload).not.toHaveProperty("actions");
  });
});
