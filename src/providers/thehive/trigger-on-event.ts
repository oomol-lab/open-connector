import type { PollDefinition } from "../../triggers/common/poll.ts";

import { isJsonObject } from "../../triggers/common/json.ts";
import { eventsPollOutputs } from "../../triggers/common/poll.ts";
import { snapshot } from "./trigger-on-event.definition.ts";

export const thehiveEvent: PollDefinition = {
  snapshot,
  buildOutputs: eventsPollOutputs,
  async poll(context) {
    const resourceType = String(context.config.resourceType) === "case" ? "case" : "alert";
    const checkpointObj = isJsonObject(context.checkpoint) ? context.checkpoint : undefined;
    const since =
      typeof checkpointObj?.updatedAt == "number" ? checkpointObj.updatedAt : context.now.getTime() - 60_000;
    const endpoint = resourceType === "case" ? "/api/case" : "/api/alert";
    const response = await context.connector.execute(
      { endpoint, method: "GET", query: { range: "0-50", sort: "+updatedAt" } },
      context.signal,
    );
    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) {
      throw new Error(`TheHive ${resourceType} poll failed with HTTP ${response.status}.`);
    }
    let maxUpdatedAt = since;
    const events: { dedupeKey: string; payload: Record<string, unknown> }[] = [];
    for (const item of response.data) {
      if (!isJsonObject(item)) continue;
      const id = String(item.id ?? item._id ?? "");
      const updatedAt = Number(item.updatedAt ?? item.createdAt ?? 0);
      if (!id || !Number.isFinite(updatedAt) || updatedAt <= since) continue;
      if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;
      events.push({
        dedupeKey: `${resourceType}:${id}:${updatedAt}`,
        payload: { resourceType, objectId: id, body: item },
      });
    }
    return {
      events,
      checkpoint: { updatedAt: maxUpdatedAt },
    };
  },
};
