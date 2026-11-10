import type { IntegrationDefinition, IntegrationReconcileContext } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { PermanentIntegrationError, TransientIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { reconcileManagedWebhook, webhookRequest } from "../../triggers/managed-webhook.ts";
import { verifyHexHmac } from "../../triggers/signature.ts";
import { snapshot } from "./trigger-on-issue-event.definition.ts";

export const linearIssueEvent: IntegrationDefinition = {
  snapshot,
  callback: { headers: ["linear-signature", "linear-delivery"], query: [] },
  initialState: { checkpoint: null, subscription: {} },
  async reconcile(context) {
    if ((typeof context.config.teamId === "string") === (context.config.allPublicTeams === true))
      throw new PermanentIntegrationError("Choose one Linear team or all public teams.");
    return reconcileManagedWebhook(context, {
      find: async () => {
        const found: { id: string; secret: string }[] = [];
        let after: string | null = null;
        for (let page = 0; page < 100; page++) {
          const data = await query(
            context,
            "query Webhooks($after: String) { webhooks(first: 100, after: $after) { nodes { id url } pageInfo { hasNextPage endCursor } } }",
            { after },
          );
          if (
            !isJsonObject(data.webhooks) ||
            !Array.isArray(data.webhooks.nodes) ||
            !isJsonObject(data.webhooks.pageInfo)
          )
            throw new TransientIntegrationError("Invalid Linear webhook page.");
          for (const item of data.webhooks.nodes) {
            if (isJsonObject(item) && item.url === context.endpointUrl && typeof item.id === "string")
              found.push({ id: item.id, secret: context.callbackSecret });
          }
          const info = data.webhooks.pageInfo;
          if (info.hasNextPage === false) return found;
          if (info.hasNextPage !== true || typeof info.endCursor !== "string" || info.endCursor === after)
            throw new TransientIntegrationError("Invalid Linear webhook pagination.");
          after = info.endCursor;
        }
        throw new TransientIntegrationError("Linear webhook pagination limit exceeded.");
      },
      create: async () => {
        const data = await query(
          context,
          "mutation CreateWebhook($input: WebhookCreateInput!) { webhookCreate(input: $input) { success webhook { id } } }",
          {
            input: {
              url: context.endpointUrl,
              secret: context.callbackSecret,
              teamId: context.config.teamId ?? null,
              allPublicTeams: context.config.allPublicTeams ?? false,
              resourceTypes: ["Issue"],
              enabled: true,
            },
          },
        );
        const result = data.webhookCreate;
        if (
          !isJsonObject(result) ||
          result.success !== true ||
          !isJsonObject(result.webhook) ||
          typeof result.webhook.id !== "string"
        )
          throw new TransientIntegrationError("Linear did not confirm webhook creation.");
        return { id: result.webhook.id, secret: context.callbackSecret };
      },
      align: async (id) => {
        const data = await query(
          context,
          "mutation UpdateWebhook($id: String!, $input: WebhookUpdateInput!) { webhookUpdate(id: $id, input: $input) { success } }",
          {
            id,
            input: {
              enabled: true,
              url: context.endpointUrl,
              secret: context.callbackSecret,
              resourceTypes: ["Issue"],
            },
          },
        );
        if (!isJsonObject(data.webhookUpdate) || data.webhookUpdate.success !== true)
          throw new TransientIntegrationError("Linear did not confirm webhook alignment.");
      },
      remove: async (id) => {
        const data = await query(
          context,
          "mutation DeleteWebhook($id: String!) { webhookDelete(id: $id) { success } }",
          { id },
        );
        if (!isJsonObject(data.webhookDelete) || data.webhookDelete.success !== true)
          throw new TransientIntegrationError("Linear did not confirm webhook deletion.");
      },
    });
  },
  async receive(context) {
    if (!(await verifyHexHmac(context.callbackSecret, [context.rawBody], context.header("linear-signature") ?? "")))
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    const payload = context.payload;
    if (
      !isJsonObject(payload) ||
      typeof payload.webhookTimestamp !== "number" ||
      !Number.isFinite(payload.webhookTimestamp) ||
      Math.abs(context.now.getTime() - payload.webhookTimestamp) > 60_000
    )
      return { outcome: "respond", status: 401, body: "", contentType: "text/plain" };
    if (
      payload.type !== "Issue" ||
      !Array.isArray(context.config.actions) ||
      !context.config.actions.includes(payload.action!)
    )
      return { outcome: "ignored", reason: "Unsubscribed Linear event." };
    const deliveryId = context.header("linear-delivery");
    if (!deliveryId || deliveryId.length > 256 || !isJsonObject(payload.data))
      return { outcome: "respond", status: 400, body: "", contentType: "text/plain" };
    return {
      outcome: "event",
      dedupeKey: deliveryId,
      outputs: { event: `Issue.${String(payload.action)}`, deliveryId, body: payload },
    };
  },
};

async function query(
  context: IntegrationReconcileContext,
  query: string,
  variables: Readonly<Record<string, JsonValue>>,
) {
  const result = await webhookRequest(context, {
    method: "POST",
    endpoint: "/graphql",
    body: { query, variables },
  });
  if (!isJsonObject(result.data)) throw new TransientIntegrationError("Invalid Linear GraphQL response.");
  if (Array.isArray(result.data.errors) && result.data.errors.length)
    throw new PermanentIntegrationError(
      "Linear rejected the webhook operation. Check workspace admin permission and webhook configuration.",
    );
  if (!isJsonObject(result.data.data)) throw new TransientIntegrationError("Linear GraphQL response is missing data.");
  return result.data.data;
}
