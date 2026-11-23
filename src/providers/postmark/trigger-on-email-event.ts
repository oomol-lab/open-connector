import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-email-event.definition.ts";

const postmarkVerificationFailedErrorCode = 1364;
const postmarkTestMessageIds = new Set(["883953f4-6105-42a2-a16a-77a8eac79483"]);
const postmarkTestDetails = new Set(["Test delivery webhook details", "Test bounce details"]);

function expectedBasicAuth(callbackSecret: string): string {
  return `Basic ${Buffer.from(`oomol:${callbackSecret}`).toString("base64")}`;
}

function readHeaderCaseInsensitive(headers: Readonly<Record<string, string>>, target: string): string | undefined {
  const lower = target.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function parseJsonBody(rawBody: Uint8Array | undefined): JsonValue | undefined {
  if (!rawBody || rawBody.byteLength === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody)) as JsonValue;
  } catch {
    return undefined;
  }
}

function isPostmarkTestProbe(payload: JsonValue | undefined): boolean {
  if (!isJsonObject(payload)) return false;
  if (typeof payload.MessageID === "string" && postmarkTestMessageIds.has(payload.MessageID)) {
    return true;
  }
  if (
    (payload.MessageID === undefined || payload.MessageID === null || payload.MessageID === "") &&
    typeof payload.Details === "string" &&
    postmarkTestDetails.has(payload.Details)
  ) {
    return true;
  }
  return false;
}

function isUnverifiedStatus(status: unknown): boolean {
  return typeof status === "string" && status.toLowerCase() === "unverified";
}

function isVerificationFailed422(response: {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly data: unknown;
}): boolean {
  if (response.status !== 422) return false;
  const headerCode = response.headers ? readHeaderCaseInsensitive(response.headers, "x-pm-apierrorcode") : undefined;
  if (headerCode?.trim() === String(postmarkVerificationFailedErrorCode)) return true;
  return (
    isJsonObject(response.data as JsonValue) &&
    (response.data as Record<string, unknown>).ErrorCode === postmarkVerificationFailedErrorCode
  );
}

export const postmarkEmailEvent: IntegrationDefinition = {
  callback: { headers: ["authorization"], query: [] },

  handshake(input) {
    if (input.method.toUpperCase() !== "POST") return undefined;
    if (
      !isPostmarkTestProbe(
        parseJsonBody(input.rawBody === undefined ? undefined : Buffer.from(input.rawBody, "base64")),
      )
    )
      return undefined;
    if (
      !input.callbackSecret ||
      !sameSecret(readHeaderCaseInsensitive(input.headers, "authorization"), expectedBasicAuth(input.callbackSecret))
    ) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    return { outcome: "respond", status: 200, body: "", contentType: "text/plain" };
  },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const messageStream = String(context.config.messageStream || "outbound");
    const configured = new Set(Array.isArray(context.config.events) ? context.config.events.map(String) : []);
    const triggersPayload = {
      Open: { Enabled: configured.has("Open"), PostFirstOpenOnly: false },
      Click: { Enabled: configured.has("Click"), ClickLocation: "HtmlAndText" },
      Delivery: { Enabled: configured.has("Delivery") },
      Bounce: { Enabled: configured.has("Bounce"), IncludeContent: false },
      SpamComplaint: { Enabled: configured.has("SpamComplaint"), IncludeContent: false },
      SubscriptionChange: { Enabled: configured.has("SubscriptionChange") },
    };
    let unverifiedHookId: string | undefined;
    let passwordRestoreHookId: string | undefined;
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, {
          endpoint: "/webhooks",
          method: "GET",
          query: { MessageStream: messageStream },
        });
        if (!isJsonObject(response.data) || !Array.isArray(response.data.Webhooks)) {
          throw new TransientIntegrationError("Postmark returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const item of response.data.Webhooks) {
          if (!isJsonObject(item) || typeof item.Url != "string") continue;
          if (item.Url != context.endpointUrl) continue;
          if (!["number", "string"].includes(typeof item.ID)) {
            throw new PermanentIntegrationError("Postmark webhook entry is missing an ID.");
          }
          const id = String(item.ID);
          if (context.active) {
            const itemTriggers = isJsonObject(item.Triggers) ? item.Triggers : undefined;
            const triggersMatch =
              itemTriggers != null &&
              Object.entries(triggersPayload).every(([key, value]) => {
                const remote = isJsonObject(itemTriggers[key]) ? itemTriggers[key] : undefined;
                return Boolean(remote?.Enabled) === value.Enabled;
              });
            const httpAuth = isJsonObject(item.HttpAuth) ? item.HttpAuth : undefined;
            const hasEchoedPassword = typeof httpAuth?.Password === "string" && httpAuth.Password.length > 0;
            const passwordMatch =
              !hasEchoedPassword || sameSecret(httpAuth!.Password as string, context.callbackSecret);
            const authMatch = httpAuth != null && httpAuth.Username === "oomol" && passwordMatch;
            if (!triggersMatch || !authMatch) {
              throw new PermanentIntegrationError("Postmark webhook settings differ from this subscription.");
            }
            if (!hasEchoedPassword) passwordRestoreHookId = id;
            if (isUnverifiedStatus(item.Status)) unverifiedHookId = id;
          }
          found.push({ id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        context.signal?.throwIfAborted();
        const response = await context.connector.execute(
          {
            endpoint: "/webhooks",
            method: "POST",
            body: {
              Url: context.endpointUrl,
              MessageStream: messageStream,
              HttpAuth: { Username: "oomol", Password: context.callbackSecret },
              Triggers: triggersPayload,
            },
          },
          context.signal,
        );
        context.signal?.throwIfAborted();
        if (response.status < 200 || response.status >= 300) {
          if (isVerificationFailed422(response)) {
            await context.state?.saveSubscription({}, context.now);
            throw new TransientIntegrationError("Postmark webhook verification failed; retry reconciliation.");
          }
          const message = `Webhook POST request failed (HTTP ${response.status}). Check resource access and webhook permissions.`;
          if (response.status === 429) {
            await context.state?.saveSubscription({}, context.now);
            throw new TransientIntegrationError(message);
          }
          if (response.status >= 400 && response.status < 500) {
            throw new PermanentIntegrationError(message);
          }
          throw new TransientIntegrationError(message);
        }
        if (!isJsonObject(response.data) || !["number", "string"].includes(typeof response.data.ID)) {
          throw new TransientIntegrationError("Postmark webhook creation returned no identity.");
        }
        const id = String(response.data.ID);
        if (isUnverifiedStatus(response.data.Status)) unverifiedHookId = id;
        return { id, secret: context.callbackSecret };
      },
      async align(id) {
        if (passwordRestoreHookId === id) {
          context.signal?.throwIfAborted();
          const updateResponse = await context.connector.execute(
            {
              endpoint: `/webhooks/${encodeURIComponent(id)}`,
              method: "PUT",
              body: {
                HttpAuth: { Username: "oomol", Password: context.callbackSecret },
              },
            },
            context.signal,
          );
          context.signal?.throwIfAborted();
          if (updateResponse.status < 200 || updateResponse.status >= 300) {
            const message = `Postmark webhook credential alignment failed (HTTP ${updateResponse.status}).`;
            if (
              isVerificationFailed422(updateResponse) ||
              updateResponse.status === 429 ||
              updateResponse.status >= 500
            ) {
              throw new TransientIntegrationError(message);
            }
            throw new PermanentIntegrationError(message);
          }
          if (isJsonObject(updateResponse.data)) {
            if (isUnverifiedStatus(updateResponse.data.Status)) {
              unverifiedHookId = id;
            } else if (
              typeof updateResponse.data.Status === "string" &&
              updateResponse.data.Status.toLowerCase() === "verified"
            ) {
              unverifiedHookId = undefined;
            }
          }
        }
        if (unverifiedHookId !== id) return;
        context.signal?.throwIfAborted();
        const response = await context.connector.execute(
          {
            endpoint: `/webhooks/${encodeURIComponent(id)}/verify`,
            method: "POST",
          },
          context.signal,
        );
        context.signal?.throwIfAborted();
        if (response.status < 200 || response.status >= 300) {
          const message = `Postmark webhook verification failed (HTTP ${response.status}).`;
          if (response.status === 422 || response.status === 429 || response.status >= 500) {
            throw new TransientIntegrationError(message);
          }
          throw new PermanentIntegrationError(message);
        }
        if (!isJsonObject(response.data) || response.data.Success !== true) {
          throw new TransientIntegrationError("Postmark webhook remains unverified after verification request.");
        }
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/webhooks/${encodeURIComponent(id)}`,
          method: "DELETE",
        });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.header("authorization"), expectedBasicAuth(context.callbackSecret))) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (isPostmarkTestProbe(body)) {
      return { outcome: "ignored", reason: "Postmark verification or test payload ignored." };
    }
    if (!isJsonObject(body) || typeof body.RecordType != "string") {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const configured = Array.isArray(context.config.events) ? context.config.events.map(String) : [];
    if (!configured.includes(body.RecordType)) {
      return { outcome: "ignored", reason: "Postmark event type is not subscribed." };
    }
    const messageId = typeof body.MessageID == "string" ? body.MessageID : "";
    let deliveryId: string;
    if (body.RecordType === "SubscriptionChange") {
      deliveryId = `SubscriptionChange:${String(body.Recipient ?? "")}:${String(body.MessageStream ?? "")}:${String(body.ChangedAt ?? "")}`;
    } else if (body.RecordType === "Click") {
      const linkDigest = sha256Hex(`${String(body.OriginalLink ?? "")}\0${String(body.ClickLocation ?? "")}`).slice(
        0,
        16,
      );
      deliveryId = `Click:${messageId}:${String(body.Recipient ?? "")}:${String(body.ReceivedAt ?? "")}:${linkDigest}`;
    } else {
      deliveryId = String(
        body.ID ??
          `${body.RecordType}:${messageId}:${String(body.Recipient ?? body.Email ?? "")}:${String(body.ReceivedAt ?? body.DeliveredAt ?? body.BouncedAt ?? "")}`,
      );
    }
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: {
        recordType: body.RecordType,
        deliveryId,
        messageId,
        body,
      },
    };
  },
};
