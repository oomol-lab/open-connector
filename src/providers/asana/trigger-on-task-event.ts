import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { bytes, verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-task-event.definition.ts";

export const asanaTaskEvent: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const projectId = String(context.config.projectId);
    const selected = context.config.eventTypes as string[];
    if (selected.includes("task.field_changed") && typeof context.config.customFieldId != "string")
      throw new PermanentIntegrationError("Select a custom field for task field changes.");
    const project = await webhookRequest(context, {
      endpoint: `/projects/${encodeURIComponent(projectId)}`,
      method: "GET",
      query: { opt_fields: "workspace.gid" },
    });
    if (
      !isJsonObject(project.data) ||
      !isJsonObject(project.data.data) ||
      !isJsonObject(project.data.data.workspace) ||
      typeof project.data.data.workspace.gid != "string"
    )
      throw new TransientIntegrationError("Asana returned no project workspace.");
    const workspace = project.data.data.workspace.gid;
    const remove = async (id: string) => {
      await webhookRequest(context, { endpoint: `/webhooks/${encodeURIComponent(id)}`, method: "DELETE" });
    };
    return reconcileManagedWebhook(context, {
      async find() {
        const found: ManagedWebhook[] = [];
        const query: Record<string, string | number> = {
          workspace,
          resource: projectId,
          limit: 100,
          opt_fields: "gid,target,resource.gid",
        };
        const seen = new Set<string>();
        for (let page = 0; page < 100; page++) {
          const response = await webhookRequest(context, { endpoint: "/webhooks", method: "GET", query });
          if (!isJsonObject(response.data) || !Array.isArray(response.data.data))
            throw new TransientIntegrationError("Asana returned an invalid webhook list.");
          for (const item of response.data.data) {
            if (!isJsonObject(item) || typeof item.target != "string" || typeof item.gid != "string")
              throw new TransientIntegrationError("Asana returned an invalid webhook.");
            if (item.target != context.endpointUrl) continue;
            if (!isJsonObject(item.resource) || item.resource.gid != projectId)
              throw new PermanentIntegrationError("Asana webhook project does not match.");
            found.push({
              id: item.gid,
              secret:
                context.state?.subscription.hookId == item.gid && typeof context.state.subscription.secret == "string"
                  ? context.state.subscription.secret
                  : "",
            });
          }
          const next = response.data.next_page;
          if (next == null) break;
          if (!isJsonObject(next) || typeof next.offset != "string" || seen.has(next.offset))
            throw new TransientIntegrationError("Asana webhook pagination did not advance.");
          seen.add(next.offset);
          query.offset = next.offset;
          if (page == 99) throw new PermanentIntegrationError("The Asana webhook list exceeds 10000 entries.");
        }
        if (found.length == 1 && !found[0]!.secret && context.active) {
          // Recover the unique owned orphan by deleting it before recreating its unreadable secret.
          await remove(found[0]!.id);
          await context.state!.saveSubscription({}, context.now);
          return [];
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            data: {
              resource: projectId,
              target: context.endpointUrl,
              filters: [
                { resource_type: "task", action: "added" },
                { resource_type: "task", action: "changed", fields: ["completed", "custom_fields"] },
              ],
            },
          },
        });
        if (
          !isJsonObject(response.data) ||
          !isJsonObject(response.data.data) ||
          typeof response.data.data.gid != "string" ||
          typeof response.data["X-Hook-Secret"] != "string" ||
          !response.data["X-Hook-Secret"]
        )
          throw new TransientIntegrationError("Asana webhook creation returned no identity or signing secret.");
        return { id: response.data.data.gid, secret: response.data["X-Hook-Secret"] };
      },
      remove,
    });
  },
  async receive(context) {
    const secret = context.state?.subscription.secret;
    if (typeof secret != "string") return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    if (!(await verifyHexHmac(secret, [context.rawBody], context.header("x-hook-signature"))))
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const payload = context.payload;
    if (!isJsonObject(payload) || !Array.isArray(payload.events))
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    const events: JsonValue[] = [];
    const identities: string[] = [];
    const selected = context.config.eventTypes as string[];
    for (const item of payload.events) {
      if (!isJsonObject(item) || !isJsonObject(item.resource) || item.resource.resource_type != "task") continue;
      if (typeof item.resource.gid != "string" || typeof item.created_at != "string")
        return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
      let event: string | undefined;
      if (item.action == "added" && isJsonObject(item.parent) && item.parent.gid == context.config.projectId)
        event = "task.added";
      if (item.action == "changed" && isJsonObject(item.change)) {
        if (item.change.field == "completed") event = "task.completed";
        if (
          item.change.field == "custom_fields" &&
          isJsonObject(item.change.new_value) &&
          item.change.new_value.gid == context.config.customFieldId
        )
          event = "task.field_changed";
      }
      if (!event || !selected.includes(event)) continue;
      const response = await context.connector.execute(
        {
          endpoint: `/tasks/${encodeURIComponent(item.resource.gid)}`,
          method: "GET",
          query: { opt_fields: "gid,name,completed,memberships.project.gid,custom_fields" },
        },
        context.signal,
      );
      if (response.status == 404) continue;
      if (response.status < 200 || response.status >= 300)
        throw new TransientIntegrationError(`Asana task lookup failed (HTTP ${response.status}).`);
      if (
        !isJsonObject(response.data) ||
        !isJsonObject(response.data.data) ||
        !Array.isArray(response.data.data.memberships)
      )
        throw new TransientIntegrationError("Asana returned invalid task details.");
      const task = response.data.data;
      if (
        !(task.memberships as JsonValue[]).some(
          (member) =>
            isJsonObject(member) && isJsonObject(member.project) && member.project.gid == context.config.projectId,
        )
      )
        continue;
      if (event == "task.completed" && task.completed !== true) continue;
      events.push({ event, task, change: item });
      identities.push(JSON.stringify(item));
    }
    if (!events.length) return { outcome: "ignored", reason: "No matching project task changes." };
    const digest = await crypto.subtle.digest("SHA-256", bytes(JSON.stringify(identities.sort())));
    return {
      outcome: "event",
      dedupeKey: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(""),
      outputs: { projectId: context.config.projectId!, events },
    };
  },
};
