import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { bytes, verifyBase64Hmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-form-response.definition.ts";

export const typeformResponse: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    if (context.state == null) throw new PermanentIntegrationError("Typeform subscription state is missing.");
    const formId = context.config.formId;
    if (typeof formId != "string" || !formId) throw new PermanentIntegrationError("Choose a Typeform form.");
    // A stable tag makes retries update the same webhook after a lost response.
    const hash = await crypto.subtle.digest("SHA-256", bytes(context.endpointUrl));
    const tag = `oomol-${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const endpoint = `/forms/${encodeURIComponent(formId)}/webhooks/${tag}`;
    context.signal?.throwIfAborted();
    const result = await context.connector.execute(
      {
        endpoint,
        method: context.active ? "PUT" : "DELETE",
        body: context.active
          ? {
              url: context.endpointUrl,
              enabled: true,
              secret: context.callbackSecret,
              event_types: { form_response: true, form_response_partial: false },
            }
          : undefined,
      },
      context.signal,
    );
    context.signal?.throwIfAborted();
    if (!(result.status >= 200 && result.status < 300) && !(!context.active && result.status == 404)) {
      const message = `Typeform webhook operation failed (HTTP ${result.status}). Check form access and webhook permissions.`;
      if (result.status >= 400 && result.status < 500 && result.status != 429)
        throw new PermanentIntegrationError(message);
      throw new TransientIntegrationError(message);
    }
    await context.state.saveSubscription(
      context.active ? { tag } : {},
      new Date(context.now.getTime() + 24 * 60 * 60 * 1000),
    );
    return { outcome: "ready" };
  },
  async receive(context) {
    const signature = context.header("typeform-signature");
    if (
      !signature?.startsWith("sha256=") ||
      !(await verifyBase64Hmac(context.callbackSecret, [context.rawBody], signature.slice(7)))
    )
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const payload = context.payload;
    if (!isJsonObject(payload) || payload.event_type != "form_response")
      return { outcome: "ignored", reason: "Only complete form responses are supported." };
    const response = payload.form_response;
    if (!isJsonObject(response) || response.form_id != context.config.formId)
      return { outcome: "ignored", reason: "Typeform form does not match this subscription." };
    if (
      typeof payload.event_id != "string" ||
      !payload.event_id ||
      typeof response.token != "string" ||
      !response.token ||
      typeof response.submitted_at != "string" ||
      !response.submitted_at ||
      !Array.isArray(response.answers) ||
      response.answers.some((answer) => !isJsonObject(answer)) ||
      ("definition" in response && !isJsonObject(response.definition))
    )
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: response.token,
      outputs: { response: { ...response, eventId: payload.event_id } },
    };
  },
};
