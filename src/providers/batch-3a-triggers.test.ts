import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bitbucketRepoEvent } from "./bitbucket/trigger-on-repo-event.ts";
import { boxItemEvent } from "./box/trigger-on-item-event.ts";
import { jotformSubmission } from "./jotform/trigger-on-submission.ts";
import { mailchimpAudienceEvent } from "./mailchimp/trigger-on-audience-event.ts";
import { trelloModelEvent } from "./trello/trigger-on-model-event.ts";

describe("Batch 3A SaaS webhook triggers", () => {
  it("box.on_item_event receives matching webhook events and ignores mismatched webhook IDs", async () => {
    const base = {
      connector: {},
      admit: true,
      callbackSecret: "sec",
      config: { targetType: "folder", targetId: "100", triggers: ["FILE.UPLOADED"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      state: { checkpoint: null, subscription: { hookId: "wh-1" } },
      header: () => undefined,
      query: (name: string) => (name === "box_token" ? "sec" : undefined),
    };
    const matched = await boxItemEvent.receive({
      ...base,
      payload: { id: "evt-1", trigger: "FILE.UPLOADED", webhook: { id: "wh-1" }, source: { id: "f-9", type: "file" } },
    } as never);
    expect(matched).toMatchObject({
      outcome: "event",
      dedupeKey: "evt-1",
      outputs: { event: "FILE.UPLOADED", targetId: "f-9" },
    });

    const ignored = await boxItemEvent.receive({
      ...base,
      payload: { id: "evt-2", trigger: "FILE.UPLOADED", webhook: { id: "wh-other" } },
    } as never);
    expect(ignored).toMatchObject({ outcome: "ignored" });
  });

  it("bitbucket.on_repo_event verifies HMAC-SHA256 signature and emits subscribed events", async () => {
    const raw = new TextEncoder().encode(JSON.stringify({ push: { changes: [] } }));
    const sig = `sha256=${createHmac("sha256", "bb-secret").update(raw).digest("hex")}`;
    const headers: Record<string, string> = {
      "x-hub-signature": sig,
      "x-event-key": "repo:push",
      "x-request-uuid": "req-42",
      "x-hook-uuid": "{hook-1}",
    };
    const res = await bitbucketRepoEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "bb-secret",
      config: { workspace: "acme", repoSlug: "web", events: ["repo:push"] },
      current: true,
      method: "POST",
      rawBody: raw,
      payload: { push: { changes: [] } },
      header: (name: string) => headers[name.toLowerCase()],
      query: () => undefined,
    } as never);
    expect(res).toMatchObject({
      outcome: "event",
      dedupeKey: "req-42",
      outputs: { event: "repo:push", hookUuid: "{hook-1}" },
    });

    const badSig = await bitbucketRepoEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "bb-secret",
      config: { workspace: "acme", repoSlug: "web", events: ["repo:push"] },
      current: true,
      method: "POST",
      rawBody: raw,
      payload: { push: { changes: [] } },
      header: () => "sha256=deadbeef",
      query: () => undefined,
    } as never);
    expect(badSig).toMatchObject({ outcome: "respond", status: 401 });
  });

  it("trello.on_model_event handles HEAD verification and POST card events", async () => {
    const headRes = await trelloModelEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "tr-sec",
      config: { modelId: "board-1" },
      current: true,
      method: "HEAD",
      rawBody: new Uint8Array(),
      payload: {},
      header: () => undefined,
      query: (name: string) => (name === "trello_token" ? "tr-sec" : undefined),
    } as never);
    expect(headRes).toMatchObject({ outcome: "respond", status: 200 });

    const postRes = await trelloModelEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "tr-sec",
      config: { modelId: "board-1", actionTypes: ["createCard"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { action: { id: "act-1", type: "createCard" }, model: { id: "board-1" } },
      header: () => undefined,
      query: (name: string) => (name === "trello_token" ? "tr-sec" : undefined),
    } as never);
    expect(postRes).toMatchObject({ outcome: "event", dedupeKey: "act-1", outputs: { actionType: "createCard" } });
  });

  it("mailchimp.on_audience_event handles GET probe and POST subscribe events", async () => {
    const getRes = await mailchimpAudienceEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "mc-sec",
      config: { listId: "list-1", events: ["subscribe"] },
      current: true,
      method: "GET",
      rawBody: new Uint8Array(),
      payload: {},
      header: () => undefined,
      query: (name: string) => (name === "mc_token" ? "mc-sec" : undefined),
    } as never);
    expect(getRes).toMatchObject({ outcome: "respond", status: 200 });

    const postRes = await mailchimpAudienceEvent.receive({
      connector: {},
      admit: true,
      callbackSecret: "mc-sec",
      config: { listId: "list-1", events: ["subscribe"] },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { type: "subscribe", fired_at: "2026-11-21 10:00:00", data: { id: "sub-1", list_id: "list-1" } },
      header: () => undefined,
      query: (name: string) => (name === "mc_token" ? "mc-sec" : undefined),
    } as never);
    expect(postRes).toMatchObject({ outcome: "event", outputs: { event: "subscribe", listId: "list-1" } });
  });

  it("jotform.on_submission verifies callback token and emits submissionId", async () => {
    const res = await jotformSubmission.receive({
      connector: {},
      admit: true,
      callbackSecret: "jf-sec",
      config: { formId: "form-9" },
      current: true,
      method: "POST",
      rawBody: new Uint8Array(),
      payload: { submissionID: "sub-999", formID: "form-9", rawRequest: "{}" },
      header: () => undefined,
      query: (name: string) => (name === "jf_token" ? "jf-sec" : undefined),
    } as never);
    expect(res).toMatchObject({
      outcome: "event",
      dedupeKey: "sub-999",
      outputs: { submissionId: "sub-999", formId: "form-9" },
    });
  });
});
