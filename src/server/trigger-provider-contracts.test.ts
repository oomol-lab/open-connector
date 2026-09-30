import type { ProviderProxyExecutor, ResolvedCredential } from "../core/types.ts";
import type { IntegrationStateContext } from "../triggers/common/integration.ts";
import type { PollDefinition, PollResult } from "../triggers/common/poll.ts";
import type { ConnectorProxy } from "../triggers/common/proxy.ts";
import type { JsonValue } from "../triggers/common/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy as airtableProxy } from "../providers/airtable/executors.ts";
import { airtableRecordChanged } from "../providers/airtable/trigger-on-record-changed.ts";
import { proxy as calendarProxy } from "../providers/googlecalendar/executors.ts";
import { googleCalendarEventChanged } from "../providers/googlecalendar/trigger-on-event-changed.ts";
import { proxy as driveProxy } from "../providers/googledrive/executors.ts";
import { googleDriveChangeListener, googleDriveChanges } from "../providers/googledrive/trigger-changes.ts";
import { googleDriveFileChange } from "../providers/googledrive/trigger-on-file-change.ts";
import { proxy as oneDriveProxy } from "../providers/one_drive/executors.ts";
import { oneDriveItemChanged } from "../providers/one_drive/trigger-on-item-changed.ts";
import { resolveTriggerConfig } from "../triggers/common/config.ts";
import { maximumPollEventsPerPage } from "../triggers/common/poll.ts";

const now = new Date("2026-10-01T00:00:00.000Z");
const initialTime = "2026-09-01T00:00:00.000Z";
const total = 250;
const credential: ResolvedCredential = {
  authType: "oauth2",
  accessToken: "provider-token",
  tokenType: "Bearer",
  profile: { accountId: "account", displayName: "Account", grantedScopes: [] },
  metadata: {},
};

afterEach(() => vi.unstubAllGlobals());

function transport(proxy: ProviderProxyExecutor): ConnectorProxy {
  return {
    async execute(request, signal) {
      const result = await proxy(request, { getCredential: async () => credential, signal });
      if (!result.ok) throw new Error(result.error.message);
      return result.response;
    },
  };
}

function respond(handler: (url: URL, init?: RequestInit) => unknown): URL[] {
  const calls: URL[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer provider-token");
    return Response.json(handler(url, init));
  });
  return calls;
}

function time(index: number): string {
  return new Date(Date.parse("2026-09-30T00:00:00.000Z") + index * 1000).toISOString();
}

async function drain(
  definition: PollDefinition,
  connector: ConnectorProxy,
  input: Readonly<Record<string, JsonValue>>,
  checkpoint: JsonValue,
): Promise<{ pages: PollResult[]; events: readonly Readonly<Record<string, JsonValue>>[] }> {
  const config = resolveTriggerConfig(definition.snapshot.configInputs, input);
  const pages: PollResult[] = [];
  for (let attempt = 0; attempt < total; attempt += 1) {
    const page = await definition.poll({ checkpoint, config, connector, now });
    expect(page.events.length).toBeLessThanOrEqual(maximumPollEventsPerPage);
    pages.push(page);
    if (!page.hasMore) return { pages, events: pages.flatMap((entry) => entry.events.map((event) => event.payload)) };
    expect(page.checkpoint).not.toEqual(checkpoint);
    checkpoint = page.checkpoint;
  }
  throw new Error("Provider pagination did not finish.");
}

describe("Native Trigger provider transport and pagination contracts", () => {
  it("creates, reads and deletes both Google Drive channel Triggers through the registered proxy", async () => {
    const calls = respond((url, init) => {
      expect(url.origin).toBe("https://www.googleapis.com");
      switch (url.pathname) {
        case "/drive/v3/changes/startPageToken":
          return { startPageToken: "initial-page" };
        case "/drive/v3/changes/watch": {
          const body = JSON.parse(String(init?.body));
          return { id: body.id, resourceId: "remote-resource", expiration: body.expiration };
        }
        case "/drive/v3/changes":
          expect(url.searchParams.get("pageToken")).toBe("initial-page");
          return { changes: [{ fileId: "changed-file" }], newStartPageToken: "next-page" };
        case "/drive/v3/channels/stop":
          expect(JSON.parse(String(init?.body))).toMatchObject({ resourceId: "remote-resource" });
          return {};
        default:
          throw new Error(`Unexpected Google Drive request: ${url}`);
      }
    });
    for (const definition of [googleDriveChanges, googleDriveChangeListener]) {
      let checkpoint: JsonValue = null;
      let subscription: Readonly<Record<string, JsonValue>> = { channels: [] };
      const state: IntegrationStateContext = {
        get checkpoint() {
          return checkpoint;
        },
        get subscription() {
          return subscription;
        },
        async saveCheckpoint(value) {
          checkpoint = value;
        },
        async saveSubscription(value) {
          subscription = value;
        },
      };
      const context = {
        active: true,
        config: resolveTriggerConfig(definition.snapshot.configInputs, {}),
        connector: transport(driveProxy),
        now,
        state,
        endpointUrl: "https://flow.example/callback",
        callbackSecret: "callback-secret",
        idempotencyKey: "binding-key",
      };
      expect(await definition.reconcile(context)).toEqual({ outcome: "ready" });
      expect(checkpoint).toEqual({ pageToken: "initial-page" });
      if (definition.listener) {
        expect(await definition.listener.read({ ...context, checkpoint })).toMatchObject({
          checkpoint: { pageToken: "next-page" },
          outputs: { events: [{ fileId: "changed-file" }] },
        });
      }
      expect(await definition.reconcile({ ...context, active: false })).toEqual({ outcome: "ready" });
      expect(subscription).toEqual({ channels: [] });
    }
    expect(calls.filter((url) => url.pathname === "/drive/v3/changes/watch")).toHaveLength(2);
    expect(calls.filter((url) => url.pathname === "/drive/v3/channels/stop")).toHaveLength(2);
  });

  it.each<Record<string, JsonValue>>([{}, { maxRecordsPerPoll: 37 }, { maxRecordsPerPoll: 1000 }])(
    "drains Airtable backlog within the page budget with %j",
    async (limits) => {
      respond((url, init) => {
        expect(url.pathname).toBe(`/v0/app${"a".repeat(14)}/Records/listRecords`);
        const body = JSON.parse(String(init?.body));
        const offset = Number(body.offset ?? 0);
        const end = Math.min(offset + body.pageSize, total);
        return {
          records: Array.from({ length: end - offset }, (_, index) => ({
            id: `record-${offset + index}`,
            fields: { changed: time(offset + index) },
          })),
          offset: end < total ? String(end) : undefined,
        };
      });
      const { pages, events } = await drain(
        airtableRecordChanged,
        transport(airtableProxy),
        { baseId: `app${"a".repeat(14)}`, tableIdOrName: "Records", triggerField: "changed", ...limits },
        { cursor: initialTime, boundaryIds: [] },
      );
      expect(events.map((event) => event.recordId)).toEqual(
        Array.from({ length: total }, (_, index) => `record-${index}`),
      );
      expect(
        pages.slice(0, -1).every((page) => (page.checkpoint as Record<string, JsonValue>).cursor === initialTime),
      ).toBe(true);
      expect(pages.at(-1)?.checkpoint).toMatchObject({ cursor: time(total - 1), boundaryIds: [`record-${total - 1}`] });
    },
  );

  it.each<Record<string, JsonValue>>([{}, { maxEventsPerPoll: 37 }, { maxEventsPerPoll: 500 }])(
    "drains Google Calendar backlog without advancing the sync token early with %j",
    async (limits) => {
      respond((url) => {
        expect(url.pathname).toBe("/calendar/v3/calendars/primary/events");
        expect(url.searchParams.get("syncToken")).toBe("initial-sync");
        const offset = Number(url.searchParams.get("pageToken") ?? 0);
        const end = Math.min(offset + Number(url.searchParams.get("maxResults")), total);
        return {
          items: Array.from({ length: end - offset }, (_, index) => ({
            id: `event-${offset + index}`,
            updated: time(offset + index),
            status: "confirmed",
          })),
          nextPageToken: end < total ? String(end) : undefined,
          nextSyncToken: end === total ? "final-sync" : undefined,
        };
      });
      const { pages, events } = await drain(
        googleCalendarEventChanged,
        transport(calendarProxy),
        { calendarId: "primary", ...limits },
        { calendarId: "primary", syncToken: "initial-sync" },
      );
      expect(events.map((event) => event.eventId)).toEqual(
        Array.from({ length: total }, (_, index) => `event-${index}`),
      );
      expect(
        pages.slice(0, -1).every((page) => (page.checkpoint as Record<string, JsonValue>).syncToken === "initial-sync"),
      ).toBe(true);
      expect(pages.at(-1)?.checkpoint).toEqual({ calendarId: "primary", syncToken: "final-sync" });
    },
  );

  it.each<Record<string, JsonValue>>([{}, { maxItemsPerPoll: 37 }, { maxItemsPerPoll: 200 }])(
    "drains OneDrive backlog without advancing the delta token early with %j",
    async (limits) => {
      respond((url) => {
        expect(url.pathname).toBe("/v1.0/me/drive/root/delta");
        const token = url.searchParams.get("token");
        const offset = token === "initial-delta" ? 0 : Number(token);
        const end = Math.min(offset + Number(url.searchParams.get("$top")), total);
        return {
          value: Array.from({ length: end - offset }, (_, index) => ({
            id: `item-${offset + index}`,
            file: {},
            eTag: `version-${offset + index}`,
          })),
          "@odata.nextLink":
            end < total ? `https://graph.microsoft.com/v1.0/me/drive/root/delta?token=${end}` : undefined,
          "@odata.deltaLink":
            end === total ? "https://graph.microsoft.com/v1.0/me/drive/root/delta?token=final-delta" : undefined,
        };
      });
      const { pages, events } = await drain(oneDriveItemChanged, transport(oneDriveProxy), limits, {
        deltaToken: "initial-delta",
        lastPolledAt: initialTime,
      });
      expect(events.map((event) => event.itemId)).toEqual(Array.from({ length: total }, (_, index) => `item-${index}`));
      expect(
        pages.slice(0, -1).every((page) => (page.checkpoint as Record<string, JsonValue>).lastPolledAt === initialTime),
      ).toBe(true);
      expect(pages.at(-1)?.checkpoint).toEqual({ deltaToken: "final-delta", lastPolledAt: now.toISOString() });
    },
  );

  it.each<Record<string, JsonValue>>([{}, { maxFilesPerPoll: 37 }, { maxFilesPerPoll: 200 }])(
    "probes and drains a Google Drive folder through the registered proxy with %j",
    async (limits) => {
      respond((url) => {
        if (url.pathname === "/drive/v3/files/folder-id") {
          return { id: "folder-id", mimeType: "application/vnd.google-apps.folder" };
        }
        expect(url.pathname).toBe("/drive/v3/files");
        const offset = Number(url.searchParams.get("pageToken") ?? 0);
        const end = Math.min(offset + Number(url.searchParams.get("pageSize")), total);
        return {
          files: Array.from({ length: end - offset }, (_, index) => ({
            id: `file-${offset + index}`,
            mimeType: "text/plain",
            modifiedTime: time(offset + index),
          })),
          nextPageToken: end < total ? String(end) : undefined,
        };
      });
      const input = { changeType: "updated", folderId: "folder-id", ...limits };
      const connector = transport(driveProxy);
      const seeded = await googleDriveFileChange.poll({
        checkpoint: null,
        config: resolveTriggerConfig(googleDriveFileChange.snapshot.configInputs, input),
        connector,
        now,
      });
      expect(seeded.events).toEqual([]);
      const { pages, events } = await drain(googleDriveFileChange, connector, input, {
        changeType: "updated",
        since: initialTime,
        floor: initialTime,
      });
      expect(events.map((event) => event.fileId)).toEqual(Array.from({ length: total }, (_, index) => `file-${index}`));
      expect(
        pages.slice(0, -1).every((page) => (page.checkpoint as Record<string, JsonValue>).since === initialTime),
      ).toBe(true);
      expect(pages.at(-1)?.checkpoint).toMatchObject({ since: time(total - 1) });
    },
  );
});
