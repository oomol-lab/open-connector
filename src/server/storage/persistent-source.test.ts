import type { PersistentSourceRequest, SourceApplicationStore } from "../../triggers/sources/persistent.ts";

import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { slackBotEvents } from "../../providers/slackbot/trigger-on-event.ts";
import { executePersistentSource } from "../../triggers/sources/persistent.ts";
import { AesGcmSecretCodec } from "../secrets/secret-codec.ts";
import { SqliteRuntimeDatabase } from "./sqlite/runtime-store.ts";

it("persists Source references across restart, fences old callbacks and rotates encrypted storage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "persistent-source-"));
  const path = join(directory, "runtime.db");
  const codec = new AesGcmSecretCodec("old-key");
  let database = new SqliteRuntimeDatabase(path, { secretCodec: codec });
  const owner = { scope: "token", connectionId: "connection" };
  const proxy = {
    providerAccountId: "U123",
    execute: async () => {
      throw new Error("Unexpected upstream request");
    },
  };
  const input = {
    appId: "A123",
    workspaceId: "T123",
    signingSecret: "private-source-key",
    eventTypes: ["app_mention"],
  };
  const create: PersistentSourceRequest = { action: "create", deploymentId: "deployment", requestKey: "source", input };
  const run = (
    request: PersistentSourceRequest,
    store: SourceApplicationStore = database.triggerStore,
    signal = new AbortController().signal,
  ) => executePersistentSource(store, slackBotEvents, owner, request, proxy, signal);
  try {
    const result = (await run(create)) as { source: { reference: { applicationId: string; sourceId: string } } };
    const reference = result.source.reference;
    const get: PersistentSourceRequest = { action: "get", deploymentId: "deployment", reference };
    database.close();
    database = new SqliteRuntimeDatabase(path, { secretCodec: codec });
    expect(await run(create)).toEqual(result);
    await expect(
      executePersistentSource(
        database.triggerStore,
        slackBotEvents,
        { ...owner, connectionId: "other" },
        get,
        proxy,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "trigger_not_found" });
    await expect(
      executePersistentSource(
        database.triggerStore,
        slackBotEvents,
        owner,
        get,
        { ...proxy, providerAccountId: "U999" },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "trigger_connection_error" });
    await expect(run({ ...create, requestKey: "aborted" }, undefined, AbortSignal.abort())).rejects.toThrow();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "url_verification", challenge: "challenge" });
    const receive: PersistentSourceRequest = {
      action: "receive",
      deploymentId: "deployment",
      reference,
      consumers: [],
      rawBody: Buffer.from(body).toString("base64"),
      headers: {
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": `v0=${createHmac("sha256", input.signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`,
      },
    };
    expect(await run(receive)).toMatchObject({ source: { ready: true } });
    const next = new AesGcmSecretCodec("new-key");
    await database.rotateSecretCodec(next);
    database.close();
    database = new SqliteRuntimeDatabase(path, { secretCodec: next });
    expect(await run(get)).toMatchObject({ source: { ready: true } });
    expect((await readFile(path)).includes(Buffer.from(input.signingSecret))).toBe(false);
    let interrupted = false;
    const concurrent: SourceApplicationStore = {
      getSourceApplication: (...args) => database.triggerStore.getSourceApplication(...args),
      saveSourceApplication: async (...args) => {
        if (!interrupted) {
          interrupted = true;
          await run({ action: "delete", deploymentId: "deployment", reference });
          await run({ ...create, requestKey: "replacement", input: { ...input, signingSecret: "replacement-key" } });
        }
        return database.triggerStore.saveSourceApplication(...args);
      },
    };
    // Force a new verification timestamp so the callback attempts a state write.
    const scope = JSON.stringify([owner.scope, "deployment", slackBotEvents.snapshot.key]);
    const stored = (await database.triggerStore.getSourceApplication(scope, reference.applicationId))!;
    await database.triggerStore.saveSourceApplication(scope, reference.applicationId, stored.revision, {
      ...stored.application,
      state: {},
    });
    await expect(run(receive, concurrent)).rejects.toMatchObject({ code: "trigger_not_found" });
    const current = (await database.triggerStore.getSourceApplication(scope, reference.applicationId))!;
    expect(current.application.state).toEqual({});
    expect(current.application.secrets).toEqual({ signingSecret: "replacement-key" });
    await database.resetRuntimeData();
    expect(await database.triggerStore.getSourceApplication(scope, reference.applicationId)).toBeNull();
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("keeps edited Source configuration across restart and fences a challenge signed with the previous secret", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-edit-"));
  const path = join(directory, "runtime.db");
  const options = { secretCodec: new AesGcmSecretCodec("storage-key") };
  let database = new SqliteRuntimeDatabase(path, options);
  const owner = { scope: "token", connectionId: "connection" };
  const proxy = {
    providerAccountId: "U123",
    execute: async () => {
      throw new Error("Unexpected upstream request");
    },
  };
  const run = (request: PersistentSourceRequest, store: SourceApplicationStore = database.triggerStore) =>
    executePersistentSource(store, slackBotEvents, owner, request, proxy, new AbortController().signal);
  try {
    const created = (await run({
      action: "create",
      deploymentId: "deployment",
      requestKey: "source",
      input: { appId: "A123", workspaceId: "T123", signingSecret: "old-secret", eventTypes: ["app_mention"] },
    })) as { source: { reference: { applicationId: string; sourceId: string }; revision: number } };
    const { reference, revision } = created.source;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: "url_verification", challenge: "challenge" });
    let changed = false;
    const concurrent: SourceApplicationStore = {
      getSourceApplication: (...args) => database.triggerStore.getSourceApplication(...args),
      saveSourceApplication: async (...args) => {
        if (!changed) {
          changed = true;
          await run({
            action: "update",
            deploymentId: "deployment",
            reference,
            expectedRevision: revision,
            input: { eventTypes: ["message.im"], signingSecret: "new-secret" },
          });
        }
        return database.triggerStore.saveSourceApplication(...args);
      },
    };
    expect(
      await run(
        {
          action: "receive",
          deploymentId: "deployment",
          reference,
          consumers: [],
          rawBody: Buffer.from(body).toString("base64"),
          headers: {
            "x-slack-request-timestamp": timestamp,
            "x-slack-signature": `v0=${createHmac("sha256", "old-secret").update(`v0:${timestamp}:${body}`).digest("hex")}`,
          },
        },
        concurrent,
      ),
    ).toMatchObject({ response: { status: 401 } });
    expect(changed).toBe(true);
    database.close();
    database = new SqliteRuntimeDatabase(path, options);
    expect(await run({ action: "get", deploymentId: "deployment", reference })).toMatchObject({
      source: { revision: revision + 1, eventTypes: ["message.im"], ready: false },
    });
    const scope = JSON.stringify([owner.scope, "deployment", slackBotEvents.snapshot.key]);
    expect(
      (await database.triggerStore.getSourceApplication(scope, reference.applicationId))?.application.secrets,
    ).toEqual({ signingSecret: "new-secret" });
    expect((await readFile(path)).includes(Buffer.from("new-secret"))).toBe(false);
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
