import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { bytes, sameSecret, verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-item-event.definition.ts";

const boxDetailConcurrency = 8;

async function mapConcurrent<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

const boxSignatureMaxAgeMs = 10 * 60_000;

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("box_token", token);
  return url.toString();
}

async function verifyBoxSignature(input: {
  readonly primaryKey?: string;
  readonly secondaryKey?: string;
  readonly rawBody: Uint8Array;
  readonly now: Date;
  readonly header: (name: string) => string | undefined;
}): Promise<boolean> {
  if (input.header("box-signature-version") !== "1") return false;
  if (input.header("box-signature-algorithm") !== "HmacSHA256") return false;
  const timestamp = input.header("box-delivery-timestamp");
  if (!timestamp) return false;
  const deliveredAtMs = Date.parse(timestamp);
  if (!Number.isFinite(deliveredAtMs)) return false;
  if (Math.abs(input.now.getTime() - deliveredAtMs) > boxSignatureMaxAgeMs) return false;
  const parts = [input.rawBody, bytes(timestamp)];
  if (
    input.primaryKey &&
    (await verifyBase64Hmac(input.primaryKey, parts, input.header("box-signature-primary"), "SHA-256"))
  ) {
    return true;
  }
  if (
    input.secondaryKey &&
    (await verifyBase64Hmac(input.secondaryKey, parts, input.header("box-signature-secondary"), "SHA-256"))
  ) {
    return true;
  }
  return false;
}

export const boxItemEvent: IntegrationDefinition = {
  callback: {
    headers: [
      "box-delivery-id",
      "box-delivery-timestamp",
      "box-signature-primary",
      "box-signature-secondary",
      "box-signature-version",
      "box-signature-algorithm",
    ],
    query: ["box_token"],
  },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const targetType = String(context.config.targetType);
    const targetId = String(context.config.targetId);
    const configuredTriggers = Array.isArray(context.config.triggers) ? context.config.triggers.map(String) : [];
    const expected = [...configuredTriggers].sort();
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const savedHookId = context.state?.subscription.hookId;
        if (typeof savedHookId == "string" && savedHookId.length > 0) {
          const detail = await context.connector.execute(
            { endpoint: `/webhooks/${encodeURIComponent(savedHookId)}`, method: "GET" },
            context.signal,
          );
          if (detail.status >= 200 && detail.status < 300 && isJsonObject(detail.data)) {
            const item = detail.data;
            if (typeof item.address == "string" && item.address === webhookUrl) {
              if (context.active) {
                const target = isJsonObject(item.target) ? item.target : undefined;
                const itemTriggers = Array.isArray(item.triggers) ? item.triggers.map(String).sort() : [];
                if (
                  target?.type != targetType ||
                  String(target?.id ?? "") != targetId ||
                  JSON.stringify(itemTriggers) != JSON.stringify(expected)
                ) {
                  throw new PermanentIntegrationError("Box webhook settings differ from this subscription.");
                }
              }
              return [{ id: savedHookId, secret: context.callbackSecret }];
            }
          }
        }
        const entries: unknown[] = [];
        let marker: string | undefined;
        for (let page = 0; page < 20; page++) {
          const query: Record<string, string> = { usemarker: "true" };
          if (marker) query.marker = marker;
          const response = await webhookRequest(context, {
            endpoint: "/webhooks",
            method: "GET",
            query,
          });
          if (!isJsonObject(response.data) || !Array.isArray(response.data.entries)) {
            throw new TransientIntegrationError("Box returned an invalid webhook list.");
          }
          entries.push(...response.data.entries);
          const nextMarker =
            typeof response.data.next_marker == "string" && response.data.next_marker.length > 0
              ? response.data.next_marker
              : undefined;
          marker = nextMarker;
          if (!nextMarker) break;
        }
        if (marker) {
          throw new TransientIntegrationError("Box webhook list exceeds the scan budget; retry reconciliation.");
        }
        const listed = entries.filter(
          (entry): entry is Record<string, JsonValue> => isJsonObject(entry) && typeof entry.id == "string",
        );
        const candidates = context.active
          ? listed.filter((entry) => {
              const miniTarget = isJsonObject(entry.target) ? entry.target : undefined;
              return !miniTarget || (miniTarget.type == targetType && String(miniTarget.id ?? "") == targetId);
            })
          : listed;
        const details = await mapConcurrent(candidates, boxDetailConcurrency, async (rawEntry) => {
          if (typeof rawEntry.address == "string" && Array.isArray(rawEntry.triggers)) return rawEntry;
          context.signal?.throwIfAborted();
          const detail = await context.connector.execute(
            { endpoint: `/webhooks/${encodeURIComponent(String(rawEntry.id))}`, method: "GET" },
            context.signal,
          );
          if (detail.status === 404) return undefined;
          if (detail.status < 200 || detail.status >= 300) {
            const message = `Webhook GET request failed (HTTP ${detail.status}). Check resource access and webhook permissions.`;
            if (detail.status >= 400 && detail.status < 500 && detail.status != 429)
              throw new PermanentIntegrationError(message);
            throw new TransientIntegrationError(message);
          }
          if (!isJsonObject(detail.data) || typeof detail.data.address != "string") {
            throw new TransientIntegrationError("Box returned an invalid webhook detail.");
          }
          return detail.data;
        });
        const found: ManagedWebhook[] = [];
        candidates.forEach((rawEntry, index) => {
          const item = details[index];
          if (!item || typeof item.address != "string") return;
          if (!item.address.startsWith(context.endpointUrl)) return;
          if (item.address !== webhookUrl) {
            if (!context.active) return;
            throw new PermanentIntegrationError("Box webhook callback URL differs from this subscription.");
          }
          if (context.active) {
            const target = isJsonObject(item.target) ? item.target : undefined;
            const itemTriggers = Array.isArray(item.triggers) ? item.triggers.map(String).sort() : [];
            if (
              target?.type != targetType ||
              String(target?.id ?? "") != targetId ||
              JSON.stringify(itemTriggers) != JSON.stringify(expected)
            ) {
              throw new PermanentIntegrationError("Box webhook settings differ from this subscription.");
            }
          }
          found.push({ id: String(rawEntry.id), secret: context.callbackSecret });
        });
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "POST",
          body: {
            target: { id: targetId, type: targetType },
            address: webhookUrl,
            triggers: configuredTriggers,
          },
        });
        if (!isJsonObject(response.data) || typeof response.data.id != "string") {
          throw new TransientIntegrationError("Box webhook creation returned no identity.");
        }
        return { id: response.data.id, secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/webhooks/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  async receive(context) {
    if (!sameSecret(context.query("box_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const signingKeys = context.connector.oauthClientConfig?.secretExtra;
    const primaryKey = signingKeys?.primarySignatureKey;
    const secondaryKey = signingKeys?.secondarySignatureKey;
    if (
      (primaryKey || secondaryKey) &&
      !(await verifyBoxSignature({
        primaryKey,
        secondaryKey,
        rawBody: context.rawBody,
        now: context.now,
        header: context.header,
      }))
    ) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const hookId = context.state?.subscription.hookId;
    if (typeof hookId != "string") {
      return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body) || !isJsonObject(body.webhook) || typeof body.trigger != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    if (String(body.webhook.id ?? "") != hookId) {
      return { outcome: "ignored", reason: "Box webhook ID does not match this subscription." };
    }
    const configuredTriggers = Array.isArray(context.config.triggers) ? context.config.triggers.map(String) : [];
    if (!configuredTriggers.includes(body.trigger)) {
      return { outcome: "ignored", reason: "Box trigger event is not subscribed." };
    }
    const deliveryId =
      (typeof body.id == "string" && body.id.length > 0 ? body.id : undefined) ?? context.header("box-delivery-id");
    if (!deliveryId) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const source = isJsonObject(body.source) ? body.source : undefined;
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: {
        event: body.trigger,
        deliveryId,
        targetId: String(source?.id ?? context.config.targetId ?? ""),
        targetType: String(source?.type ?? context.config.targetType ?? ""),
        body,
      },
    };
  },
};
