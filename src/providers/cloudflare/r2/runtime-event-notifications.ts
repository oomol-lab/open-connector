import type { ProviderRuntimeHandler } from "../../provider-executors.ts";
import type { CloudflareContext } from "../shared/context.ts";

import { looseArray, optionalString, compactObject } from "../../../core/cast.ts";
import { withAccountHandlers, resolveAccountId } from "../shared/context.ts";
import {
  buildR2JurisdictionHeaders,
  requestEnvelope,
  readObject,
  readObjectArray,
  readOptionalStringArray,
  readRequiredString,
} from "./client.ts";

export const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = withAccountHandlers({
  list_event_notification_rules: listEventNotificationRules,
  get_event_notification_rules: getEventNotificationRules,
  create_event_notification_rules: createEventNotificationRules,
  delete_event_notification_rules: deleteEventNotificationRules,
});

function buildEventNotificationPath(input: Record<string, unknown>, context: CloudflareContext) {
  const accountId = resolveAccountId(input, context);
  const bucketName = String(input.bucketName);
  return `/accounts/${encodeURIComponent(accountId)}/event_notifications/r2/${encodeURIComponent(bucketName)}/configuration`;
}

function buildQueuePath(input: Record<string, unknown>, context: CloudflareContext) {
  const queueId = String(input.queueId);
  return `${buildEventNotificationPath(input, context)}/queues/${encodeURIComponent(queueId)}`;
}

async function listEventNotificationRules(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
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

async function getEventNotificationRules(input: Record<string, unknown>, context: CloudflareContext) {
  const envelope = await requestEnvelope(
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

async function createEventNotificationRules(input: Record<string, unknown>, context: CloudflareContext) {
  const bucketName = String(input.bucketName);
  const queueId = String(input.queueId);
  await requestEnvelope(
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

async function deleteEventNotificationRules(input: Record<string, unknown>, context: CloudflareContext) {
  const bucketName = String(input.bucketName);
  const queueId = String(input.queueId);
  const ruleIds = readOptionalStringArray(input.ruleIds);
  await requestEnvelope(
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
