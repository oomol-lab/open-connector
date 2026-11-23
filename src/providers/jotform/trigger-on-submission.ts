import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-submission.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("jf_token", token);
  return url.toString();
}

function normalizeJotformWebhooks(content: unknown): Array<[string, string]> | null {
  if (Array.isArray(content)) {
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < content.length; i++) {
      const value = content[i];
      if (typeof value === "string") entries.push([String(i), value]);
    }
    return entries;
  }
  if (isJsonObject(content)) {
    const entries: Array<[string, string]> = [];
    for (const [id, value] of Object.entries(content)) {
      if (typeof value === "string") entries.push([id, value]);
    }
    return entries;
  }
  return null;
}

export const jotformSubmission: IntegrationDefinition = {
  callback: { headers: [], query: ["jf_token"] },
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const formId = encodeURIComponent(String(context.config.formId));
    const webhookUrl = withCallbackToken(context.endpointUrl, context.callbackSecret);
    return reconcileManagedWebhook(context, {
      async find() {
        const response = await webhookRequest(context, {
          endpoint: `/form/${formId}/webhooks`,
          method: "GET",
        });
        const entries = isJsonObject(response.data) ? normalizeJotformWebhooks(response.data.content) : null;
        if (!entries) {
          throw new TransientIntegrationError("Jotform returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const [id, url] of entries) {
          if (!url.startsWith(context.endpointUrl)) continue;
          if (url !== webhookUrl) {
            if (!context.active) continue;
            throw new PermanentIntegrationError("Jotform webhook callback URL differs from this subscription.");
          }
          found.push({ id, secret: context.callbackSecret });
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: `/form/${formId}/webhooks`,
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ webhookURL: webhookUrl }).toString(),
        });
        const entries = isJsonObject(response.data) ? normalizeJotformWebhooks(response.data.content) : null;
        if (!entries) {
          throw new TransientIntegrationError("Jotform webhook creation returned no identity.");
        }
        const match = entries.find(([, url]) => url === webhookUrl);
        if (!match) {
          throw new TransientIntegrationError("Jotform webhook creation did not return the registered webhook ID.");
        }
        return { id: match[0], secret: context.callbackSecret };
      },
      async remove(_id) {
        const response = await webhookRequest(context, {
          endpoint: `/form/${formId}/webhooks`,
          method: "GET",
        });
        const entries = isJsonObject(response.data) ? normalizeJotformWebhooks(response.data.content) : null;
        if (!entries) {
          throw new TransientIntegrationError("Jotform returned an invalid webhook list before deletion.");
        }
        const match = entries.find(([, url]) => url === webhookUrl);
        if (!match) return;
        await webhookRequest(context, {
          endpoint: `/form/${formId}/webhooks/${encodeURIComponent(match[0])}`,
          method: "DELETE",
        });
      },
    });
  },
  receive(context) {
    if (!sameSecret(context.query("jf_token"), context.callbackSecret)) {
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    }
    const body = context.payload;
    if (!isJsonObject(body)) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    const submissionId = String(body.submissionID ?? body.submission_id ?? "");
    if (!submissionId) {
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    }
    return {
      outcome: "event",
      dedupeKey: submissionId,
      outputs: {
        submissionId,
        formId: String(body.formID ?? body.form_id ?? context.config.formId ?? ""),
        body,
      },
    };
  },
};
