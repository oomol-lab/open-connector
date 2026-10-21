import type { TriggerConfigOption, TriggerConfigOptionsContext } from "../../triggers/common/configOptions.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ConnectorProxyRequest, ConnectorProxyResult } from "../../triggers/common/proxy.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { bytes, verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-form-response.definition.ts";

export const tallyFormResponse: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async configOptions(context) {
    if (context.field != "formId") throw new PermanentIntegrationError("Unknown Tally configuration field.");
    const options: TriggerConfigOption[] = [];
    for (let page = 1; page <= 100; page++) {
      const result = await request(context, { endpoint: "/forms", method: "GET", query: { page, limit: 100 } });
      success(result);
      const data = pageData(result.data, "items", page);
      for (const form of data.items) {
        if (!isJsonObject(form) || !nonempty(form.id) || typeof form.name != "string")
          throw new TransientIntegrationError("Tally returned an invalid form.");
        options.push({ value: form.id, label: form.name || form.id });
      }
      if (!data.hasMore) return options;
    }
    throw new PermanentIntegrationError("The Tally form list exceeds 10000 entries.");
  },
  async receive(context) {
    // Tally signs the parsed JSON serialization rather than transport whitespace.
    if (
      !(await verifyBase64Hmac(
        context.callbackSecret,
        [bytes(JSON.stringify(context.payload))],
        context.header("tally-signature"),
      ))
    )
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const payload = context.payload;
    if (!isJsonObject(payload) || payload.eventType != "FORM_RESPONSE")
      return { outcome: "ignored", reason: "Tally event is not a form response." };
    const data = payload.data;
    if (!isJsonObject(data) || data.formId != context.config.formId)
      return { outcome: "ignored", reason: "Tally form does not match this subscription." };
    if (
      !nonempty(payload.eventId) ||
      !nonempty(payload.createdAt) ||
      !nonempty(data.submissionId) ||
      !nonempty(data.responseId) ||
      !Array.isArray(data.fields) ||
      data.fields.some(
        (field) =>
          !isJsonObject(field) ||
          !nonempty(field.key) ||
          !nonempty(field.type) ||
          (field.label !== null && typeof field.label != "string") ||
          !("value" in field) ||
          ("options" in field &&
            (!Array.isArray(field.options) || field.options.some((option) => !isJsonObject(option)))),
      )
    )
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: payload.eventId,
      outputs: { response: { ...data, eventId: payload.eventId, createdAt: payload.createdAt } },
    };
  },
  async reconcile(context) {
    const state = context.state;
    if (state == null) throw new PermanentIntegrationError("Tally subscription state is missing.");
    const formId = context.config.formId;
    if (!nonempty(formId)) throw new PermanentIntegrationError("Choose a Tally form.");
    let hookId = nonempty(state.subscription.hookId) ? state.subscription.hookId : undefined;
    if (hookId == null) {
      for (let page = 1; page <= 100; page++) {
        const result = await request(context, { endpoint: "/webhooks", method: "GET", query: { page, limit: 100 } });
        success(result);
        const data = pageData(result.data, "webhooks", page);
        for (const hook of data.items) {
          if (!isJsonObject(hook) || !nonempty(hook.id) || !nonempty(hook.formId) || typeof hook.url != "string")
            throw new TransientIntegrationError("Tally returned an invalid webhook.");
          if (hook.formId == formId && hook.url == context.endpointUrl) {
            if (hookId != null)
              throw new PermanentIntegrationError(
                "Multiple Tally webhooks match this subscription. Remove duplicates before retrying.",
              );
            hookId = hook.id;
          }
        }
        if (!data.hasMore) break;
        if (page == 100) throw new PermanentIntegrationError("The Tally webhook list exceeds 10000 entries.");
      }
    }
    if (!context.active) {
      if (hookId != null) {
        const result = await request(context, {
          endpoint: `/webhooks/${encodeURIComponent(hookId)}`,
          method: "DELETE",
        });
        if (result.status != 404) success(result);
      } else if (state.subscription.creating === true) {
        throw new PermanentIntegrationError(
          "Tally webhook creation has an uncertain outcome. Verify the remote subscription before cleanup.",
        );
      }
      await state.saveSubscription({}, later(context.now));
      return { outcome: "ready" };
    }
    if (hookId == null) {
      if (state.subscription.creating === true)
        throw new PermanentIntegrationError(
          "Tally webhook creation has an uncertain outcome. Retry after verifying the remote subscription.",
        );
      await state.saveSubscription({ creating: true }, context.now);
      const result = await request(context, {
        endpoint: "/webhooks",
        method: "POST",
        body: {
          formId,
          url: context.endpointUrl,
          eventTypes: ["FORM_RESPONSE"],
          signingSecret: context.callbackSecret,
        },
      });
      if (result.status >= 400 && result.status < 500) await state.saveSubscription({}, context.now);
      success(result);
      if (!isJsonObject(result.data) || !nonempty(result.data.id))
        throw new TransientIntegrationError("Tally webhook creation returned no identity.");
      hookId = result.data.id;
    }
    await state.saveSubscription({ hookId }, context.now);
    const aligned = await request(context, {
      endpoint: `/webhooks/${encodeURIComponent(hookId)}`,
      method: "PATCH",
      body: {
        url: context.endpointUrl,
        eventTypes: ["FORM_RESPONSE"],
        signingSecret: context.callbackSecret,
        isEnabled: true,
      },
    });
    if (aligned.status == 404) {
      await state.saveSubscription({}, context.now);
      return { outcome: "pending" };
    }
    success(aligned);
    await state.saveSubscription({ hookId }, later(context.now));
    return { outcome: "ready" };
  },
};

function nonempty(value: unknown): value is string {
  return typeof value == "string" && value.length > 0;
}

function pageData(value: unknown, field: string, page: number): { items: JsonValue[]; hasMore: boolean } {
  if (
    !isJsonObject(value) ||
    !Array.isArray(value[field]) ||
    typeof value.hasMore != "boolean" ||
    value.page !== page ||
    (value.hasMore && value[field].length == 0)
  )
    throw new TransientIntegrationError("Tally returned an invalid page.");
  return { items: value[field], hasMore: value.hasMore };
}

async function request(
  context: Pick<TriggerConfigOptionsContext, "connector" | "signal">,
  input: ConnectorProxyRequest,
): Promise<ConnectorProxyResult> {
  context.signal?.throwIfAborted();
  const result = await context.connector.execute(input, context.signal);
  context.signal?.throwIfAborted();
  return result;
}

function success(result: ConnectorProxyResult): void {
  if (result.status >= 200 && result.status < 300) return;
  if (result.status >= 400 && result.status < 500 && result.status != 429)
    throw new PermanentIntegrationError(
      `Tally rejected the subscription request (HTTP ${result.status}). Check form access and API key permissions.`,
    );
  throw new TransientIntegrationError(`Tally subscription request failed (HTTP ${result.status}).`);
}

function later(now: Date): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
