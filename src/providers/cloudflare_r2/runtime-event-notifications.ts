import type { ProviderActionHandlerSubset, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { CloudflareR2Context } from "./runtime.ts";

import { looseArray, optionalString, compactObject } from "../../core/cast.ts";
import {
  buildR2JurisdictionHeaders,
  cloudflareR2RequestEnvelope,
  readObject,
  readObjectArray,
  readOptionalStringArray,
  readRequiredString,
  resolveAccountId,
} from "./runtime.ts";

export const cloudflareR2EventNotificationActionHandlers: ProviderActionHandlerSubset<
  "cloudflare_r2",
  ProviderRuntimeHandler<CloudflareR2Context>
> = {
  list_event_notification_rules: cloudflareR2ListEventNotificationRules,
  get_event_notification_rules: cloudflareR2GetEventNotificationRules,
  create_event_notification_rules: cloudflareR2CreateEventNotificationRules,
  delete_event_notification_rules: cloudflareR2DeleteEventNotificationRules,
};
function buildEventNotificationPath(input: Record<string, unknown>, context: CloudflareR2Context) {
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  return `/accounts/${encodeURIComponent(accountId)}/event_notifications/r2/${encodeURIComponent(bucketName)}/configuration`;
}

function buildQueuePath(input: Record<string, unknown>, context: CloudflareR2Context) {
  const queueId = String(input.queueId);
  return `${buildEventNotificationPath(input, context)}/queues/${encodeURIComponent(queueId)}`;
}

async function cloudflareR2ListEventNotificationRules(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      path: buildEventNotificationPath(input, context),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );
  const result = readObject(envelope.result, "cloudflare r2 event notification config");

  return {
    bucketName: optionalString(result.bucketName) ?? String(input.bucketName),
    queues: readObjectArray(result.queues, "cloudflare r2 event notification queues").map(normalizeR2QueueConfig),
  };
}

async function cloudflareR2GetEventNotificationRules(input: Record<string, unknown>, context: CloudflareR2Context) {
  const envelope = await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      path: buildQueuePath(input, context),
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return normalizeR2QueueConfig(readObject(envelope.result, "cloudflare r2 event notification queue"));
}

async function cloudflareR2CreateEventNotificationRules(input: Record<string, unknown>, context: CloudflareR2Context) {
  const bucketName = String(input.bucketName);
  const queueId = String(input.queueId);
  await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      method: "PUT",
      path: buildQueuePath(input, context),
      body: { rules: looseArray(input.rules) },
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return { bucketName, queueId, created: true };
}

async function cloudflareR2DeleteEventNotificationRules(input: Record<string, unknown>, context: CloudflareR2Context) {
  const bucketName = String(input.bucketName);
  const queueId = String(input.queueId);
  const ruleIds = readOptionalStringArray(input.ruleIds);
  await cloudflareR2RequestEnvelope(
    context.accessToken,
    {
      method: "DELETE",
      path: buildQueuePath(input, context),
      body: ruleIds ? { ruleIds } : undefined,
      headers: buildR2JurisdictionHeaders(input),
    },
    { fetcher: context.fetcher, signal: context.signal },
    "execute",
  );

  return { bucketName, queueId, deleted: true };
}

function normalizeR2QueueConfig(queue: Record<string, unknown>) {
  return compactObject({
    queueId: readRequiredString(queue, "queueId"),
    queueName: optionalString(queue.queueName),
    rules: readObjectArray(queue.rules, "cloudflare r2 event notification rules").map((rule) =>
      compactObject({
        ruleId: optionalString(rule.ruleId),
        createdAt: optionalString(rule.createdAt),
        description: optionalString(rule.description),
        actions: readOptionalStringArray(rule.actions) ?? [],
        prefix: optionalString(rule.prefix),
        suffix: optionalString(rule.suffix),
      }),
    ),
  });
}
