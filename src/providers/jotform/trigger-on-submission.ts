import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { sameSecret } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-submission.definition.ts";

function withCallbackToken(endpointUrl: string, token: string): string {
  const url = new URL(endpointUrl);
  url.searchParams.set("jf_token", token);
  return url.toString();
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
        const response = await webhookRequest(context, { endpoint: `/form/${formId}/webhooks`, method: "GET" });
        if (!isJsonObject(response.data) || !isJsonObject(response.data.content)) {
          throw new TransientIntegrationError("Jotform returned an invalid webhook list.");
        }
        const found: ManagedWebhook[] = [];
        for (const [id, url] of Object.entries(response.data.content)) {
          if (typeof url === "string" && url.startsWith(context.endpointUrl)) {
            found.push({ id, secret: context.callbackSecret });
          }
        }
        return found;
      },
      async create() {
        const response = await webhookRequest(context, {
          endpoint: `/form/${formId}/webhooks`,
          method: "POST",
          body: { webhookURL: webhookUrl },
        });
        if (!isJsonObject(response.data) || !isJsonObject(response.data.content)) {
          throw new TransientIntegrationError("Jotform webhook creation returned no identity.");
        }
        const match = Object.entries(response.data.content).find(
          ([, url]) => typeof url === "string" && url.startsWith(context.endpointUrl),
        );
        if (!match) {
          throw new TransientIntegrationError("Jotform webhook creation did not return the registered webhook ID.");
        }
        return { id: match[0], secret: context.callbackSecret };
      },
      async remove(id) {
        await webhookRequest(context, {
          endpoint: `/form/${formId}/webhooks/${encodeURIComponent(id)}`,
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
