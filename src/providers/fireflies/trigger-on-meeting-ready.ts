import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { TransientIntegrationError } from "../../triggers/common/integration.ts";
import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { webhookRequest } from "../../triggers/managed-webhook.ts";
import { firefliesAccount } from "../../triggers/sources/fireflies.ts";
import { snapshot } from "./trigger-on-meeting-ready.definition.ts";

export const firefliesMeetingReady: IntegrationDefinition = {
  snapshot,
  eventSource: "fireflies",
  source: firefliesAccount,
  async sourceIdentity(context): Promise<Readonly<Record<string, JsonValue>>> {
    const accountId = context.connector.providerAccountId;
    if (!accountId) throw new PermanentIntegrationError("Fireflies requires a verified connection identity.");
    const meetingId = context.config.meetingId;
    if (meetingId == null) return { accountId };
    if (typeof meetingId !== "string" || !meetingId || meetingId.length > 256)
      throw new PermanentIntegrationError("Invalid Fireflies meeting ID.");
    const result = await webhookRequest(context, {
      method: "POST",
      endpoint: "/graphql",
      body: {
        query: "query TriggerMeeting($id: String!) { transcript(id: $id) { id } }",
        variables: { id: meetingId },
      },
    });
    if (!isJsonObject(result.data)) throw new TransientIntegrationError("Invalid Fireflies access response.");
    if (Array.isArray(result.data.errors) && result.data.errors.length) {
      const denied = result.data.errors.every(
        (error) =>
          isJsonObject(error) &&
          ["object_not_found", "forbidden", "not_in_team"].includes(
            String(isJsonObject(error.extensions) ? error.extensions.code : error.code),
          ),
      );
      if (denied) return { accountId, meetingId, accessible: false };
      throw new TransientIntegrationError(
        "Fireflies could not verify meeting access. Check API permissions, plan and availability.",
      );
    }
    if (!isJsonObject(result.data.data)) throw new TransientIntegrationError("Invalid Fireflies access response.");
    const transcript = result.data.data.transcript;
    if (transcript == null) return { accountId, meetingId, accessible: false };
    if (!isJsonObject(transcript) || transcript.id !== meetingId)
      throw new TransientIntegrationError("Fireflies returned a different meeting.");
    return { accountId, meetingId, accessible: true };
  },
  receive(context) {
    if (context.eventSourceId !== context.config.sourceId)
      return { outcome: "respond", status: 404, body: "", contentType: "text/plain" };
    const payload = context.payload;
    if (
      !isJsonObject(payload) ||
      typeof payload.deliveryId !== "string" ||
      !payload.deliveryId ||
      !isJsonObject(payload.body)
    )
      throw new PermanentIntegrationError("Invalid shared Fireflies event.");
    return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
  },
  async reconcile() {
    throw new PermanentIntegrationError("This deployment does not support shared Fireflies event sources.");
  },
};
