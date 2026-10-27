import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

export interface UpstreamRequest {
  readonly method: string;
  readonly endpoint: string;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, unknown>>;
}

export interface TriggerHarness {
  request(triggerId: string, body: unknown, owner?: "other"): Promise<Response>;
  disconnect(): Promise<void>;
  close(): Promise<void>;
}

export type CreateHarness = (
  upstream: (service: string, request: UpstreamRequest) => Promise<{ status: number; data: unknown }>,
) => Promise<TriggerHarness>;

async function success(response: Response) {
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  return body.data;
}

async function failure(response: Response, status: number, code: string) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  assert.equal(body.errorCode, code, JSON.stringify(body));
}

const tally = "tally.on_form_response";
const github = "github.watch_pull_request";
const endpointUrl = "https://flow.example/events/contract";
const config = { owner: "oomol-lab", repo: "open-flow", number: 114 };
const originalPullRequest = {
  id: 123,
  number: 114,
  title: "Change",
  html_url: "https://github.com/oomol-lab/open-flow/pull/114",
  state: "open",
  draft: true,
  merged: false,
  updated_at: "2026-10-20T00:00:00.000Z",
  head: { sha: "head" },
  base: { sha: "base" },
};

const cases: readonly { name: string; verify(create: CreateHarness): Promise<void> }[] = [
  {
    name: "Jira keeps remote resource configuration private and recovers a lost creation response before cleanup",
    async verify(create) {
      let hook: { id: number; url: string; jqlFilter: string; events: string[]; expirationDate: string } | undefined;
      let registrations = 0;
      const harness = await create(async (_service, request) => {
        if (request.endpoint === "/project/P" || request.endpoint === "/project/100")
          return { status: 200, data: { id: "100", key: "P" } };
        if (request.endpoint === "/myself") return { status: 200, data: { accountId: "user" } };
        if (request.endpoint === "/serverInfo")
          return { status: 200, data: { baseUrl: "https://contract.atlassian.net" } };
        if (request.endpoint === "/webhook" && request.method === "GET")
          return { status: 200, data: { values: hook ? [hook] : [], isLast: true } };
        if (request.endpoint === "/webhook" && request.method === "POST") {
          registrations++;
          const body = request.body as { url: string; webhooks: { jqlFilter: string; events: string[] }[] };
          hook = {
            id: 123,
            url: body.url,
            ...body.webhooks[0]!,
            expirationDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          };
          throw new Error("Lost registration response");
        }
        if (request.endpoint === "/webhook" && request.method === "DELETE") {
          hook = undefined;
          return { status: 204, data: null };
        }
        throw new Error("Unexpected request " + request.endpoint);
      });
      const send = (request: object) =>
        harness.request("jira.on_issue_event", {
          operation: "sourceReference",
          request: { deploymentId: "managed-resource", ...request },
        });
      const call = async (request: object) => success(await send(request));
      try {
        const created = await call({
          action: "create",
          requestKey: "jira",
          input: { project: "P", eventTypes: ["jira:issue_created"] },
        });
        const reference = created.source.reference;
        const prepared = await call({
          action: "prepare",
          reference,
          config: { eventTypes: ["jira:issue_created"] },
          endpointUrl,
        });
        assert.deepEqual(prepared.subscriptions, [{ key: "project" }]);
        const resource = { action: "resource", reference, key: "project", active: true };
        assert.notEqual((await send(resource)).status, 200);
        const ready = await call(resource);
        assert.equal(ready.outcome, "ready");
        assert.equal(ready.source.ready, true);
        assert.equal(registrations, 1);
        assert.ok(!JSON.stringify(ready).includes("webhookId"));
        assert.notEqual((await send({ action: "delete", reference })).status, 200);
        assert.equal((await call({ ...resource, active: false })).outcome, "ready");
        assert.equal(hook, undefined);
        await call({ action: "delete", reference });
      } finally {
        await harness.close();
      }
    },
  },

  ...[
    {
      trigger: "feishu_app_bot.on_event",
      input: {
        verificationToken: "private-token",
        encryptKey: "private-key",
        manageSubscriptions: false,
        eventTypes: ["approval_instance"],
      },
    },
    {
      trigger: "fireflies.on_meeting_ready",
      input: { signingSecret: "private-key", eventTypes: ["meeting.transcribed"] },
    },
    {
      trigger: "intercom.on_conversation_event",
      input: { appId: "app", signingSecret: "private-key", eventTypes: ["conversation.user.created"] },
    },
    { trigger: "jira.on_issue_event", input: { project: "P", eventTypes: ["jira:issue_created"] } },
    {
      trigger: "sentry.on_issue_alert",
      input: {
        appId: "app",
        installationId: "installation",
        organizationId: "org",
        signingSecret: "private-key",
        eventTypes: ["issue.alert"],
      },
    },
    {
      trigger: "zoom.on_recording_ready",
      input: { appId: "app", signingSecret: "private-key", eventTypes: ["recording.completed"] },
    },
  ].map(({ trigger, input }) => ({
    name: trigger + " owns Source configuration and supports idempotent creation, edits and deletion",
    async verify(create: CreateHarness) {
      const harness = await create(async (_service, request) => {
        const data =
          request.endpoint === "/project/P" || request.endpoint === "/project/100"
            ? { id: "100", key: "P" }
            : request.endpoint === "/myself"
              ? { accountId: "user" }
              : request.endpoint === "/serverInfo"
                ? { baseUrl: "https://contract.atlassian.net" }
                : request.endpoint === "/users/me"
                  ? { id: "user", account_id: "account" }
                  : request.endpoint === "/organizations/org/"
                    ? { id: "1", slug: "org" }
                    : request.endpoint === "/organizations/org/sentry-app-installations/"
                      ? [
                          {
                            uuid: "installation",
                            app: { uuid: "app" },
                            status: "installed",
                            organization: { slug: "org" },
                          },
                        ]
                      : undefined;
        assert.notEqual(data, undefined, "Unexpected upstream request: " + request.endpoint);
        return { status: 200, data };
      });
      const call = async (request: object) =>
        success(
          await harness.request(trigger, {
            operation: "sourceReference",
            request: { deploymentId: "all-sources", ...request },
          }),
        );
      try {
        const created = await call({ action: "create", requestKey: "source", input });
        const reference = created.source.reference;
        assert.ok(reference.sourceId && reference.applicationId);
        assert.ok(!JSON.stringify(created).includes("private-"));
        assert.deepEqual((await call({ action: "get", reference })).source, created.source);
        assert.deepEqual((await call({ action: "create", requestKey: "source", input })).source, created.source);
        const updated = await call({
          action: "update",
          reference,
          expectedRevision: created.source.revision,
          input: { eventTypes: input.eventTypes },
        });
        assert.deepEqual(updated.source, created.source);
        await call({ action: "delete", reference });
        await call({ action: "delete", reference });
        await failure(
          await harness.request(trigger, {
            operation: "sourceReference",
            request: { deploymentId: "all-sources", action: "get", reference },
          }),
          404,
          "trigger_not_found",
        );
      } finally {
        await harness.close();
      }
    },
  })),

  {
    name: "Asana verifies a candidate during creation without waiting for its subscription lock",
    async verify(create) {
      let callback: URL | undefined;
      const secret = "a".repeat(64);
      const harness = await create(async (service, request) => {
        assert.equal(service, "asana");
        if (request.endpoint === "/projects/project")
          return { status: 200, data: { data: { workspace: { gid: "workspace" } } } };
        if (request.endpoint === "/webhooks" && request.method === "GET") return { status: 200, data: { data: [] } };
        if (request.endpoint === "/webhooks" && request.method === "POST") {
          callback = new URL((request.body as { data: { target: string } }).data.target);
          const input = {
            operation: "receive",
            subscriptionId: callback.searchParams.get("connector_reference"),
            method: "POST",
            headers: { "x-hook-secret": secret },
            query: Object.fromEntries(callback.searchParams),
            rawBody: "",
            admit: false,
            current: true,
          };
          const response = await success(await harness.request("asana.on_task_event", input));
          assert.deepEqual(response.result, {
            outcome: "respond",
            status: 200,
            body: "",
            contentType: "text/plain",
            headers: { "x-hook-secret": secret },
          });
          const invalid = await harness.request("asana.on_task_event", {
            ...input,
            query: { connector_subscription: "wrong" },
          });
          assert.notEqual(invalid.status, 200);
          return { status: 201, data: { data: { gid: "hook" }, "X-Hook-Secret": secret } };
        }
        throw new Error(`Unexpected Asana request ${request.method} ${request.endpoint}`);
      });
      try {
        const result = await success(
          await harness.request("asana.on_task_event", {
            operation: "reconcile",
            config: { projectId: "project", eventTypes: ["task.added"] },
            requestKey: "asana-create",
            endpointUrl,
            active: true,
          }),
        );
        assert.equal(result.outcome, "ready");
        assert.equal(result.subscription.id, callback?.searchParams.get("connector_reference"));
      } finally {
        await harness.close();
      }
    },
  },
  {
    name: "Slack creation identities support cleanup before or after creation without credentials",
    async verify(create) {
      const harness = await create(async () => {
        throw new Error("Unexpected upstream request");
      });
      const request = {
        deploymentId: "deployment",
        requestKey: "cancelled",
        input: { appId: "A123", workspaceId: "T123", signingSecret: "secret", eventTypes: ["app_mention"] },
      };
      const call = (action: object) =>
        harness.request("slackbot.on_event", {
          operation: "sourceReference",
          request: { deploymentId: "deployment", ...action },
        });
      try {
        const reference = { appId: "A123", requestKey: request.requestKey };
        assert.deepEqual(await success(await call({ action: "delete", reference })), { deleted: true });
        await failure(await call({ action: "create", ...request }), 409, "invalid_input");
        await success(await call({ action: "create", ...request, requestKey: "created" }));
        await harness.disconnect();
        for (const requestKey of ["created", "never-arrived", "created"])
          assert.deepEqual(await success(await call({ action: "delete", reference: { appId: "A123", requestKey } })), {
            deleted: true,
          });
      } finally {
        await harness.close();
      }
    },
  },
  {
    name: "Slack references can be deleted by their owner after the connection disappears",
    async verify(create) {
      const harness = await create(async () => {
        throw new Error("Unexpected upstream request");
      });
      try {
        const trigger = "slackbot.on_event";
        const created = await success(
          await harness.request(trigger, {
            operation: "sourceReference",
            request: {
              action: "create",
              deploymentId: "deployment",
              requestKey: "disconnected",
              input: { appId: "A123", workspaceId: "T123", signingSecret: "secret", eventTypes: ["app_mention"] },
            },
          }),
        );
        await harness.disconnect();
        const request = { deploymentId: "deployment", reference: created.source.reference };
        assert.notEqual(
          (await harness.request(trigger, { operation: "sourceReference", request: { ...request, action: "get" } }))
            .status,
          200,
        );
        await failure(
          await harness.request(
            trigger,
            { operation: "sourceReference", request: { ...request, action: "delete" } },
            "other",
          ),
          404,
          "trigger_not_found",
        );
        for (let retry = 0; retry < 2; retry++)
          assert.deepEqual(
            await success(
              await harness.request(trigger, {
                operation: "sourceReference",
                request: { ...request, action: "delete" },
              }),
            ),
            { deleted: true },
          );
      } finally {
        await harness.close();
      }
    },
  },
  {
    name: "Slack reference edits reject conflicts and invalidate shared verification when the secret changes",
    async verify(create) {
      const harness = await create(async () => {
        throw new Error("Unexpected upstream request");
      });
      const send = (request: unknown, owner?: "other") =>
        harness.request("slackbot.on_event", { operation: "sourceReference", request }, owner);
      const call = async (request: unknown) => success(await send(request));
      const input = {
        appId: "A123",
        workspaceId: "T123",
        signingSecret: "original-secret",
        eventTypes: ["app_mention"],
      };
      const createA = { action: "create", deploymentId: "deployment", requestKey: "edit-a", input };
      const challenge = (reference: unknown, secret: string) => {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const body = JSON.stringify({ type: "url_verification", challenge: "verified" });
        return {
          action: "receive",
          deploymentId: "deployment",
          reference,
          consumers: [],
          rawBody: Buffer.from(body).toString("base64"),
          headers: {
            "x-slack-request-timestamp": timestamp,
            "x-slack-signature": `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
          },
        };
      };
      try {
        const a = (await call(createA)).source;
        const b = (await call({ ...createA, requestKey: "edit-b", input: { ...input, workspaceId: "T456" } })).source;
        const get = { action: "get", deploymentId: "deployment", reference: a.reference };
        const verified = (await call(challenge(a.reference, input.signingSecret))).source;
        const edit = {
          ...get,
          action: "update",
          expectedRevision: verified.revision,
          input: { eventTypes: ["app_mention", "message.im"] },
        };
        await failure(await send(edit, "other"), 404, "trigger_not_found");
        await failure(await send({ ...edit, input: { ...edit.input, name: "local-name" } }), 400, "invalid_input");
        await failure(await send({ ...edit, input: { eventTypes: ["unknown"] } }), 400, "invalid_input");
        await failure(
          await send({ ...edit, input: { eventTypes: ["app_mention", "app_mention"] } }),
          400,
          "invalid_input",
        );
        await failure(await send({ ...edit, input: { ...edit.input, signingSecret: "" } }), 400, "invalid_input");
        await failure(await send({ ...edit, expectedRevision: a.revision }), 409, "invalid_input");
        const updated = (await call(edit)).source;
        assert.equal(updated.revision, verified.revision + 1);
        assert.equal(updated.ready, true);
        assert.deepEqual(updated.eventTypes, edit.input.eventTypes);
        assert.deepEqual((await call(edit)).source, updated);
        assert.deepEqual((await call({ ...get, reference: b.reference })).source.eventTypes, ["app_mention"]);
        assert.deepEqual(
          (await call({ ...get, action: "prepare", config: { eventTypes: ["message.im"] } })).subscriptions,
          [],
        );
        await failure(await send(createA), 409, "invalid_input");
        const rotation = {
          ...edit,
          expectedRevision: updated.revision,
          input: { ...edit.input, signingSecret: "replacement-secret" },
        };
        const rotated = (await call(rotation)).source;
        assert.equal(rotated.revision, updated.revision + 1);
        assert.equal(rotated.ready, false);
        assert.equal((await call({ ...get, reference: b.reference })).source.ready, false);
        assert.ok(!JSON.stringify(rotated).includes(rotation.input.signingSecret));
        assert.deepEqual((await call(rotation)).source, rotated);
        await failure(
          await send({ ...get, action: "prepare", config: { eventTypes: ["message.im"] } }),
          400,
          "invalid_input",
        );
        assert.equal((await call(challenge(b.reference, input.signingSecret))).response.status, 401);
        const reverified = (await call(challenge(b.reference, rotation.input.signingSecret))).source;
        assert.equal(reverified.ready, true);
        assert.equal((await call(get)).source.ready, true);
        const replay = (await call(rotation)).source;
        assert.equal(replay.ready, true);
        assert.equal(replay.revision, reverified.revision);
        await failure(await send({ ...edit, input: { eventTypes: ["message.im"] } }), 409, "invalid_input");
        const before = (await call(get)).source;
        const edits = await Promise.all([
          send({ ...edit, expectedRevision: before.revision, input: { eventTypes: ["message.im"] } }),
          send({ ...edit, expectedRevision: before.revision, input: { eventTypes: ["app_mention"] } }),
        ]);
        assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409]);
        assert.equal((await call(get)).source.revision, before.revision + 1);
        await call({ ...get, action: "delete" });
        await failure(await send(rotation), 404, "trigger_not_found");
      } finally {
        await harness.close();
      }
    },
  },
  {
    name: "Slack persistent Sources share verification, protect references and release the last secret",
    async verify(create) {
      const harness = await create(async () => {
        throw new Error("Unexpected upstream request");
      });
      const send = (request: unknown, owner?: "other") =>
        harness.request("slackbot.on_event", { operation: "sourceReference", request }, owner);
      const call = async (request: unknown) => success(await send(request));
      const input = {
        appId: "A123",
        workspaceId: "T123",
        signingSecret: "persistent-secret",
        eventTypes: ["app_mention"],
      };
      const command = { action: "create", deploymentId: "deployment", requestKey: "source-a", input };
      const signed = (payload: unknown, secret = input.signingSecret) => {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const body = JSON.stringify(payload, null, 2);
        return {
          rawBody: Buffer.from(body).toString("base64"),
          headers: {
            "X-Slack-Request-Timestamp": timestamp,
            "X-Slack-Signature": `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
          },
        };
      };
      try {
        const [a, b] = await Promise.all([
          call(command),
          call({ ...command, requestKey: "source-b", input: { ...input, workspaceId: "T456" } }),
        ]);
        assert.equal(a.source.ready, false);
        await failure(
          await send({ ...command, input: { ...input, teamId: "caller-supplied-owner" } }),
          400,
          "invalid_input",
        );
        assert.equal(a.source.reference.applicationId, b.source.reference.applicationId);
        assert.notDeepEqual(a.source.reference, b.source.reference);
        assert.ok(!JSON.stringify(a).includes(input.signingSecret));
        assert.equal(a.source.secrets, undefined);
        assert.deepEqual((await call(command)).source.reference, a.source.reference);
        await failure(
          await send({ ...command, input: { ...input, eventTypes: ["message.im"] } }),
          409,
          "invalid_input",
        );
        await failure(
          await send({
            ...command,
            requestKey: "wrong-secret",
            input: { ...input, workspaceId: "T999", signingSecret: "wrong" },
          }),
          409,
          "invalid_input",
        );
        const getA = { action: "get", deploymentId: "deployment", reference: a.source.reference };
        await failure(await send(getA, "other"), 404, "trigger_not_found");
        await failure(await send({ ...getA, deploymentId: "other" }), 404, "trigger_not_found");
        await failure(
          await send({ ...getA, source: { secrets: { signingSecret: "injected" } } }),
          400,
          "invalid_input",
        );
        await failure(
          await send({
            action: "prepare",
            deploymentId: "deployment",
            reference: a.source.reference,
            config: { eventTypes: ["app_mention"] },
          }),
          400,
          "invalid_input",
        );
        const challenge = {
          action: "receive",
          deploymentId: "deployment",
          reference: a.source.reference,
          ...signed({ type: "url_verification", challenge: "验证 😀" }),
          consumers: [],
        };
        const verified = await call(challenge);
        assert.deepEqual(JSON.parse(verified.response.body), { challenge: "验证 😀" });
        assert.equal((await call({ ...getA, reference: b.source.reference })).source.ready, true);
        assert.deepEqual(
          (
            await call({
              action: "prepare",
              deploymentId: "deployment",
              reference: a.source.reference,
              config: { eventTypes: ["app_mention"] },
            })
          ).subscriptions,
          [],
        );
        const payload = {
          type: "event_callback",
          api_app_id: "A123",
          team_id: "T456",
          event_id: "EvPersisted",
          authorizations: [{ team_id: "T456", user_id: "U123", is_bot: true }],
          event: { type: "app_mention", channel: "C123", user: "U456", text: "持久化 😀", ts: "123.456" },
        };
        const receive = {
          action: "receive",
          deploymentId: "deployment",
          reference: b.source.reference,
          ...signed(payload),
          consumers: [{ id: "matching", config: { eventTypes: ["app_mention"] } }],
        };
        const event = await call(receive);
        assert.equal(event.event.id, "EvPersisted");
        assert.deepEqual(event.event.matches, ["matching"]);
        assert.ok(!JSON.stringify(event).includes(input.signingSecret));
        assert.deepEqual((await call(receive)).event, event.event);
        assert.equal((await call({ ...receive, headers: {} })).response.status, 401);
        await failure(await send({ ...receive, rawBody: "not base64" }), 400, "invalid_input");
        const unconfigured = await call({
          ...receive,
          ...signed({ ...payload, event: { ...payload.event, type: "message", channel_type: "im" } }),
          consumers: [{ id: "unexpected", config: { eventTypes: ["message.im"] } }],
        });
        assert.equal(unconfigured.event, undefined);
        assert.equal(unconfigured.response.status, 200);
        await failure(
          await send({ ...receive, headers: { ...receive.headers, "x-slack-signature": "duplicate" } }),
          400,
          "invalid_input",
        );
        const remove = { action: "delete", deploymentId: "deployment", reference: a.source.reference };
        await failure(await send(remove, "other"), 404, "trigger_not_found");
        assert.deepEqual(await call(remove), { deleted: true });
        assert.deepEqual(await call(remove), { deleted: true });
        await failure(await send(getA), 404, "trigger_not_found");
        await failure(await send(command), 409, "invalid_input");
        assert.deepEqual((await call(receive)).event, event.event);
        await call({ ...remove, reference: b.source.reference });
        await failure(await send(receive), 404, "trigger_not_found");
        const fresh = await call({
          ...command,
          requestKey: "fresh",
          input: { ...input, signingSecret: "replacement-secret" },
        });
        assert.equal(fresh.source.ready, false);
        assert.equal((await call({ ...challenge, reference: fresh.source.reference })).response.status, 401);
        assert.equal(
          (
            await call({
              ...challenge,
              reference: fresh.source.reference,
              ...signed({ type: "url_verification", challenge: "new" }, "replacement-secret"),
            })
          ).source.ready,
          true,
        );
      } finally {
        await harness.close();
      }
    },
  },

  {
    name: "Slack sources verify raw bytes, isolate workspaces and preserve event identity",
    async verify(create) {
      const harness = await create(async () => {
        throw new Error("Unexpected upstream request");
      });
      const call = async (request: unknown) =>
        success(await harness.request("slackbot.on_event", { operation: "source", request }));
      const input = {
        kind: "slack",
        version: 1,
        name: "Contract",
        connectionId: "connection",
        teamId: "team",
        appId: "A123",
        workspaceId: "T123",
        signingSecret: "contract-secret",
        eventTypes: ["app_mention", "message.im"],
      };
      const signed = (payload: unknown, timestamp = String(Math.floor(Date.now() / 1000))) => {
        const body = JSON.stringify(payload, null, 2);
        return {
          rawBody: Buffer.from(body).toString("base64"),
          headers: {
            "X-Slack-Request-Timestamp": timestamp,
            "X-Slack-Signature": `v0=${createHmac("sha256", input.signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
          },
        };
      };
      try {
        const first = (await call({ action: "initialize", input })).source;
        const other = (await call({ action: "initialize", input: { ...input, workspaceId: "T456" } })).source;
        assert.notEqual(first.identity, other.identity);
        assert.equal(first.state.projection.ready, false);
        const challenge = signed({ type: "url_verification", challenge: "验证 😀" });
        const verified = await call({ action: "receive", source: first, ...challenge, consumers: [] });
        assert.equal(verified.response.status, 200);
        assert.deepEqual(JSON.parse(verified.response.body), { challenge: "验证 😀" });
        assert.equal(verified.source.state.projection.ready, true);
        const payload = {
          type: "event_callback",
          api_app_id: "A123",
          team_id: "T123",
          event_id: "Ev123",
          authorizations: [{ team_id: "T123", user_id: "U123", is_bot: true }],
          event: {
            type: "app_mention",
            channel: "C123",
            user: "U456",
            text: "你好 😀",
            ts: "123.456",
            thread_ts: "123.000",
          },
        };
        const request = {
          action: "receive",
          source: verified.source,
          ...signed(payload),
          consumers: [
            { id: "matches", config: { eventTypes: ["app_mention"], channelIds: ["C123"] } },
            { id: "other-channel", config: { eventTypes: ["app_mention"], channelIds: ["C456"] } },
            { id: "other-event", config: { eventTypes: ["message.im"] } },
          ],
        };
        const expected = {
          id: "Ev123",
          type: "app_mention",
          payload: {
            event: "app_mention",
            deliveryId: "Ev123",
            appId: "A123",
            teamId: "T123",
            channel: "C123",
            user: "U456",
            text: "你好 😀",
            ts: "123.456",
            threadTs: "123.000",
            body: payload.event,
          },
          matches: ["matches"],
        };
        assert.deepEqual((await call(request)).event, expected);
        assert.deepEqual(
          (await call({ ...request, headers: { ...request.headers, "x-slack-retry-num": "1" } })).event,
          expected,
        );
        for (const changed of [
          { ...request, source: other },
          { ...request, ...signed({ ...payload, api_app_id: "A456" }) },
          {
            ...request,
            ...signed({ ...payload, authorizations: [{ team_id: "T123", user_id: "U999", is_bot: true }] }),
          },
        ]) {
          const ignored = await call(changed);
          assert.equal(ignored.response.status, 200);
          assert.equal(ignored.event, undefined);
        }
        for (const changed of [
          { ...request, rawBody: Buffer.from(JSON.stringify(payload)).toString("base64") },
          { ...request, ...signed(payload, String(Math.floor(Date.now() / 1000) - 600)) },
          { ...request, headers: {} },
        ]) {
          const rejected = await call(changed);
          assert.equal(rejected.response.status, 401);
          assert.equal(rejected.event, undefined);
        }
        await failure(
          await harness.request("slackbot.on_event", {
            operation: "source",
            request: { ...request, headers: { ...request.headers, "x-slack-signature": "duplicate" } },
          }),
          400,
          "invalid_input",
        );
      } finally {
        await harness.close();
      }
    },
  },

  {
    name: "rejects unsupported operations and invalid configuration before upstream side effects",
    async verify(create) {
      let calls = 0;
      const harness = await create(async () => {
        calls++;
        throw new Error("Unexpected upstream request");
      });
      try {
        await failure(await harness.request(tally, { operation: "unknown" }), 400, "invalid_input");
        await failure(
          await harness.request(tally, { operation: "read", config: { formId: "form-1" }, checkpoint: null }),
          400,
          "invalid_input",
        );
        await failure(
          await harness.request(github, { operation: "read", config: { ...config, number: 0 }, checkpoint: null }),
          400,
          "invalid_input",
        );
        await failure(
          await harness.request(github, { operation: "read", config, checkpoint: { version: "x", sequence: -1 } }),
          400,
          "invalid_input",
        );
        await failure(
          await harness.request(tally, {
            operation: "options",
            config: {},
            field: "formId",
            protocolVersion: "unsupported",
          }),
          400,
          "invalid_input",
        );
        assert.equal(calls, 0);
      } finally {
        await harness.close();
      }
    },
  },
  {
    name: "Tally options preserve Unicode across pages",
    async verify(create) {
      const pages: unknown[] = [];
      const harness = await create(async (service, request) => {
        assert.equal(service, "tally");
        assert.equal(request.endpoint, "/forms");
        pages.push(request.query?.page);
        return {
          status: 200,
          data: {
            items: [{ id: `form-${request.query?.page}`, name: "表单 😀" }],
            page: request.query?.page,
            hasMore: request.query?.page === 1,
          },
        };
      });
      try {
        assert.deepEqual(
          await success(await harness.request(tally, { operation: "options", config: {}, field: "formId" })),
          [
            { value: "form-1", label: "表单 😀" },
            { value: "form-2", label: "表单 😀" },
          ],
        );
        assert.deepEqual(pages, [1, 2]);
      } finally {
        await harness.close();
      }
    },
  },
  {
    name: "Tally subscriptions recover lost creation responses, verify callbacks and retain failed cleanup",
    async verify(create) {
      let hook: { id: string; url: string; formId: string; signingSecret: string } | undefined;
      let creates = 0;
      let deletes = 0;
      let failDelete = true;
      const harness = await create(async (service, request) => {
        assert.equal(service, "tally");
        if (request.method === "POST") {
          creates++;
          const body = request.body as Record<string, unknown>;
          assert.equal(body.formId, "form-1");
          assert.equal(typeof body.url, "string");
          assert.equal(typeof body.signingSecret, "string");
          hook = { id: "hook-1", formId: "form-1", url: String(body.url), signingSecret: String(body.signingSecret) };
          throw new Error("Response lost after remote creation");
        }
        if (request.method === "GET")
          return { status: 200, data: { webhooks: hook ? [hook] : [], page: 1, hasMore: false } };
        if (request.method === "PATCH") return { status: 200, data: hook };
        assert.equal(request.method, "DELETE");
        assert.equal(request.endpoint, "/webhooks/hook-1");
        deletes++;
        return { status: failDelete ? 503 : 204, data: {} };
      });
      const reconcile = {
        operation: "reconcile",
        config: { formId: "form-1" },
        endpointUrl,
        requestKey: "tally-contract",
        active: true,
      };
      try {
        const lost = await harness.request(tally, reconcile);
        assert.equal(lost.status, 500);
        const prepared = await success(await harness.request(tally, reconcile));
        assert.equal(prepared.outcome, "ready");
        assert.equal(typeof prepared.subscription.id, "string");
        assert.deepEqual(Object.keys(prepared.subscription), ["id"]);
        assert.ok(hook);
        assert.ok(!JSON.stringify(prepared).includes(hook.signingSecret));
        await success(await harness.request(tally, { ...reconcile, subscriptionId: prepared.subscription.id }));
        assert.equal(creates, 1);
        const payload = {
          eventId: "event-1",
          eventType: "FORM_RESPONSE",
          createdAt: "2026-10-20T00:00:00.000Z",
          data: {
            formId: "form-1",
            submissionId: "submission-1",
            responseId: "response-1",
            fields: [{ key: "name", label: "姓名", type: "INPUT_TEXT", value: "李明 😀" }],
          },
        };
        const signature = createHmac("sha256", hook.signingSecret).update(JSON.stringify(payload)).digest("base64");
        const receive = {
          operation: "receive",
          subscriptionId: prepared.subscription.id,
          method: "POST",
          headers: { "content-type": "application/json", "tally-signature": signature },
          query: Object.fromEntries(new URL(hook.url).searchParams),
          rawBody: Buffer.from(JSON.stringify(payload, null, 2)).toString("base64"),
          admit: true,
          current: true,
        };
        const event = (await success(await harness.request(tally, receive))).result;
        assert.deepEqual(event, {
          outcome: "event",
          dedupeKey: "event-1",
          outputs: { response: { ...payload.data, eventId: payload.eventId, createdAt: payload.createdAt } },
        });
        assert.deepEqual((await success(await harness.request(tally, receive))).result, event);
        assert.equal(
          (
            await success(
              await harness.request(tally, {
                ...receive,
                headers: { ...receive.headers, "tally-signature": "invalid" },
              }),
            )
          ).result.status,
          401,
        );
        assert.equal((await success(await harness.request(tally, { ...receive, query: {} }))).result.status, 404);
        assert.equal(
          (
            await success(
              await harness.request(tally, { ...receive, query: { connector_subscription: "another-subscription" } }),
            )
          ).result.status,
          404,
        );
        await failure(
          await harness.request(tally, { ...reconcile, config: { formId: "other" } }),
          409,
          "invalid_input",
        );
        await failure(await harness.request(tally, { ...reconcile, active: false }), 503, "proxy_upstream_error");
        failDelete = false;
        await success(await harness.request(tally, { ...reconcile, active: false }));
        await success(await harness.request(tally, { ...reconcile, active: false }));
        assert.equal(deletes, 2);
        assert.equal((await success(await harness.request(tally, receive))).result.outcome, "ignored");
      } finally {
        await harness.close();
      }
    },
  },
  {
    name: "GitHub Watch PR checkpoints replay rejected observations and resume across clients",
    async verify(create) {
      let current = originalPullRequest;
      let status = 200;
      const upstream = async (_service: string, request: UpstreamRequest) => {
        if (request.endpoint.endsWith("/pulls/114")) return { status, data: current };
        if (request.method === "POST") return { status: 201, data: { id: 42 } };
        return { status: 200, data: [] };
      };
      const harness = await create(upstream);
      let resumed: TriggerHarness | undefined;
      try {
        const prepared = await success(
          await harness.request(github, {
            operation: "reconcile",
            config,
            endpointUrl,
            requestKey: "github-contract",
            active: true,
          }),
        );
        const checkpoint = prepared.checkpoint;
        assert.deepEqual(checkpoint, {
          version: "sha256:d016d73708ad63af030c345081a0282921984c44ed152b16d3fbebc40b08a278",
          sequence: 0,
        });
        const read = (value: unknown) => ({ operation: "read", config, checkpoint: value });
        const baseline = await success(await harness.request(github, read(checkpoint)));
        assert.equal(baseline.outputs, null);
        assert.deepEqual(baseline.checkpoint, checkpoint);
        current = { ...originalPullRequest, draft: false, head: { sha: "next" } };
        const changed = await success(await harness.request(github, read(checkpoint)));
        assert.deepEqual(changed.outputs.pullRequest, {
          id: 123,
          number: 114,
          title: "Change",
          url: originalPullRequest.html_url,
          state: "open",
          draft: false,
          merged: false,
          updatedAt: originalPullRequest.updated_at,
          headSha: "next",
          baseSha: "base",
        });
        assert.equal(changed.checkpoint.sequence, 1);
        assert.equal(
          changed.outputs.version,
          "sha256:400dc9004d1afff098750ad96ab16ecca00b2f87b770afbec1f50ad5a5277495",
        );
        assert.equal(changed.hasMore, false);
        assert.equal(changed.dedupeKey, `1:${changed.outputs.version}`);
        assert.deepEqual(await success(await harness.request(github, read(checkpoint))), changed);
        resumed = await create(upstream);
        const restored = JSON.parse(JSON.stringify(changed.checkpoint));
        assert.equal((await success(await resumed.request(github, read(restored)))).outputs, null);
        current = originalPullRequest;
        const reverted = await success(await resumed.request(github, read(restored)));
        assert.equal(reverted.checkpoint.sequence, 2);
        assert.notEqual(reverted.dedupeKey, baseline.dedupeKey);
        for (const [upstreamStatus, expectedStatus, code] of [
          [503, 503, "proxy_upstream_error"],
          [401, 409, "trigger_connection_error"],
          [404, 400, "invalid_input"],
        ] as const) {
          status = upstreamStatus;
          await failure(await harness.request(github, read(checkpoint)), expectedStatus, code);
        }
        status = 200;
        current = { ...originalPullRequest, draft: false, head: { sha: "next" } };
        assert.deepEqual(await success(await harness.request(github, read(checkpoint))), changed);
      } finally {
        await resumed?.close();
        await harness.close();
      }
    },
  },
];

export async function runTriggerConformance(create: CreateHarness): Promise<void> {
  const failures: Error[] = [];
  for (const scenario of cases) {
    try {
      await scenario.verify(create);
      console.log(`PASS ${scenario.name}`);
    } catch (error) {
      failures.push(new Error(scenario.name, { cause: error }));
      console.error(`FAIL ${scenario.name}`, error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Trigger conformance failed");
}
