import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { ManagedWebhook } from "../../triggers/managed-webhook.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot, events } from "./trigger-on-deployment-event.definition.ts";

export const vercelDeploymentEvent: IntegrationDefinition = {
  snapshot,
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    const query = { teamId: String(context.config.teamId) };
    const remove = async (id: string) => {
      await webhookRequest(context, { endpoint: `/v1/webhooks/${encodeURIComponent(id)}`, method: "DELETE", query });
    };
    return reconcileManagedWebhook(context, {
      async find() {
        const result = await webhookRequest(context, { endpoint: "/v1/webhooks", method: "GET", query });
        if (
          !Array.isArray(result.data) ||
          result.data.some((item) => !isJsonObject(item) || typeof item.url != "string" || typeof item.id != "string")
        )
          throw new TransientIntegrationError("Vercel returned an invalid webhook list.");
        const matches = result.data.filter((item) => isJsonObject(item) && item.url == context.endpointUrl) as Record<
          string,
          import("../../triggers/common/types.ts").JsonValue
        >[];
        if (matches.length > 1)
          throw new PermanentIntegrationError(
            "Multiple Vercel webhooks match this subscription. Remove duplicates before retrying.",
          );
        const found: ManagedWebhook[] = [];
        for (const item of matches) {
          const id = item.id as string;
          if (
            item.ownerId != context.config.teamId ||
            !Array.isArray(item.projectIds) ||
            item.projectIds.length != 1 ||
            item.projectIds[0] != context.config.projectId ||
            !Array.isArray(item.events) ||
            item.events.length != events.length ||
            !events.every((event) => (item.events as string[]).includes(event))
          )
            throw new PermanentIntegrationError(
              "The Vercel webhook scope differs from this subscription. Restore its project and event settings.",
            );
          const state = context.state!;
          if (state.subscription.hookId == id && typeof state.subscription.secret == "string") {
            found.push({ id, secret: state.subscription.secret });
          } else {
            // Vercel only returns the secret on creation. Remove the owned orphan before recreating it.
            await remove(id);
            await state.saveSubscription({}, context.now);
          }
        }
        return found;
      },
      async create() {
        const result = await webhookRequest(context, {
          endpoint: "/v1/webhooks",
          method: "POST",
          query,
          body: { url: context.endpointUrl, events: [...events], projectIds: [context.config.projectId!] },
        });
        const data = result.data;
        if (
          !isJsonObject(data) ||
          typeof data.id != "string" ||
          !data.id ||
          typeof data.secret != "string" ||
          !data.secret
        )
          throw new TransientIntegrationError("Vercel webhook creation returned no identity or secret.");
        return { id: data.id, secret: data.secret };
      },
      remove,
    });
  },
  async receive(context) {
    const secret = context.state?.subscription.secret;
    if (typeof secret != "string") return { outcome: "respond", status: 503, body: "", contentType: "text/plain" };
    if (!(await verifyHexHmac(secret, [context.rawBody], context.header("x-vercel-signature"), "SHA-1")))
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const body = context.payload;
    if (!isJsonObject(body) || typeof body.type != "string" || !events.includes(body.type as (typeof events)[number]))
      return { outcome: "ignored", reason: "Vercel event does not match." };
    const payload = body.payload;
    if (
      !isJsonObject(payload) ||
      !isJsonObject(payload.team) ||
      payload.team.id != context.config.teamId ||
      !isJsonObject(payload.project) ||
      payload.project.id != context.config.projectId
    )
      return { outcome: "ignored", reason: "Vercel project or Team does not match." };
    if (
      (context.config.environment == "production" && payload.target != "production") ||
      (context.config.environment == "preview" && payload.target !== null)
    )
      return { outcome: "ignored", reason: "Vercel environment does not match." };
    if (
      typeof body.id != "string" ||
      !body.id ||
      !isJsonObject(payload.deployment) ||
      typeof payload.deployment.id != "string" ||
      !payload.deployment.id
    )
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: body.id,
      outputs: {
        event: body.type,
        deliveryId: body.id,
        deploymentId: payload.deployment.id,
        projectId: payload.project.id as string,
        body: payload,
      },
    };
  },
};
