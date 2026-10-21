import type { IntegrationReconcileContext, IntegrationReconcileResult } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import {
  IntegrationConnectionError,
  PermanentIntegrationError,
  TransientIntegrationError,
} from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { webhookRequest } from "../../triggers/managed-webhook.ts";

export const jiraEvents: string[] = ["jira:issue_created", "jira:issue_updated", "comment_created"];
const day = 86_400_000;
interface Webhook {
  id: number;
  url: string;
  jqlFilter: string;
  events: string[];
  expiresAt: number;
}

export function requireJiraCloud(connector: IntegrationReconcileContext["connector"]): string {
  const cloudId = /^jira:([^:]+)(?::|$)/.exec(connector.providerAccountId ?? "")?.[1];
  if (connector.authType !== "oauth2" || !cloudId || !connector.oauthClientConfig?.clientSecret)
    throw new IntegrationConnectionError(
      "Jira Cloud OAuth and the matching application client secret are required. Reconnect with webhook permissions.",
    );
  return cloudId;
}

async function webhooks(context: IntegrationReconcileContext): Promise<Webhook[]> {
  const items: Webhook[] = [];
  let startAt = 0;
  for (;;) {
    const { data } = await webhookRequest(context, {
      method: "GET",
      endpoint: "/webhook",
      query: { startAt, maxResults: 100 },
    });
    if (!isJsonObject(data) || !Array.isArray(data.values) || typeof data.isLast !== "boolean")
      throw new TransientIntegrationError("Invalid Jira webhook page.");
    for (const item of data.values) {
      if (
        !isJsonObject(item) ||
        !Number.isSafeInteger(item.id) ||
        Number(item.id) <= 0 ||
        typeof item.url !== "string" ||
        typeof item.jqlFilter !== "string" ||
        !Array.isArray(item.events) ||
        !item.events.every((event) => typeof event === "string") ||
        typeof item.expirationDate !== "string"
      )
        throw new TransientIntegrationError("Invalid Jira webhook record.");
      const expiresAt = Date.parse(item.expirationDate);
      if (!Number.isFinite(expiresAt)) throw new TransientIntegrationError("Invalid Jira webhook expiration.");
      items.push({
        id: Number(item.id),
        url: item.url,
        jqlFilter: item.jqlFilter,
        events: item.events as string[],
        expiresAt,
      });
    }
    if (data.isLast) return items;
    if (data.values.length === 0 || data.startAt !== startAt)
      throw new TransientIntegrationError("Invalid Jira webhook pagination.");
    startAt += data.values.length;
  }
}

export async function reconcileJiraResource(context: IntegrationReconcileContext): Promise<IntegrationReconcileResult> {
  requireJiraCloud(context.connector);
  const { projectId } = context.config;
  if (typeof projectId !== "string" || !/^\d+$/.test(projectId))
    throw new PermanentIntegrationError("A verified Jira project ID is required.");
  let endpoint: URL;
  try {
    endpoint = new URL(context.endpointUrl);
  } catch {
    throw new PermanentIntegrationError("A public HTTPS callback URL is required.");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash)
    throw new PermanentIntegrationError("Jira requires a public HTTPS callback without credentials or a fragment.");
  const now = context.now.getTime();
  const state = context.state!;
  const saved = state.subscription;
  if (
    context.active &&
    typeof saved.checkedAt === "number" &&
    typeof saved.expiresAt === "number" &&
    saved.checkedAt + day > now &&
    saved.expiresAt - 7 * day > now
  )
    return { outcome: "ready" };
  const save = (value: Readonly<Record<string, JsonValue>>) => state.saveSubscription(value, new Date(now + day));
  let all = await webhooks(context);
  const own = () => {
    const matches = all.filter((item) => item.url === endpoint.href);
    if (matches.length > 1)
      throw new PermanentIntegrationError(
        "Multiple Jira webhooks use this source callback. Resolve the duplicate subscriptions before retrying.",
      );
    return matches[0];
  };
  let hook = own();
  if (!context.active) {
    if (hook)
      await webhookRequest(context, { method: "DELETE", endpoint: "/webhook", body: { webhookIds: [hook.id] } });
    else if (saved.creating === true)
      throw new PermanentIntegrationError(
        "Jira registration is still uncertain. Confirm the remote webhook before cleanup.",
        "trigger_subscription_uncertain",
      );
    await save({});
    return { outcome: "ready" };
  }
  if (!hook) {
    if (saved.creating === true)
      throw new PermanentIntegrationError(
        "Jira registration is uncertain and no matching webhook is visible. Retry after checking Jira; do not create another source.",
        "trigger_subscription_uncertain",
      );
    if (all.length >= 5)
      throw new PermanentIntegrationError(
        "Jira OAuth webhook quota reached: five subscriptions per application, user and site. Remove an unused subscription, then retry.",
        "trigger_quota_exceeded",
      );
    await save({ creating: true });
    const result = await context.connector.execute(
      {
        method: "POST",
        endpoint: "/webhook",
        body: { url: endpoint.href, webhooks: [{ jqlFilter: `project = ${projectId}`, events: jiraEvents }] },
      },
      context.signal,
    );
    context.signal?.throwIfAborted();
    if (result.status < 200 || result.status >= 300) {
      if (result.status >= 400 && result.status < 500) await save({});
      const message = `Jira webhook registration failed (HTTP ${result.status}). Check OAuth scopes, callback domain and webhook quota.`;
      if (result.status === 429 || result.status >= 500) throw new TransientIntegrationError(message);
      throw new PermanentIntegrationError(message);
    }
    const results = isJsonObject(result.data) ? result.data.webhookRegistrationResult : undefined;
    if (!Array.isArray(results) || results.length !== 1 || !isJsonObject(results[0]))
      throw new TransientIntegrationError("Jira registration returned no confirmed webhook ID.");
    const created = results[0];
    if (Array.isArray(created.errors) && created.errors.length) {
      await save({});
      throw new PermanentIntegrationError(
        `Jira rejected the webhook: ${created.errors.filter((value) => typeof value === "string").join("; ")}`,
      );
    }
    if (!Number.isSafeInteger(created.createdWebhookId) || Number(created.createdWebhookId) <= 0)
      throw new TransientIntegrationError("Jira registration returned no confirmed webhook ID.");
    await save({ creating: true, webhookId: Number(created.createdWebhookId) });
    all = await webhooks(context);
    hook = own();
    if (!hook || hook.id !== created.createdWebhookId)
      throw new TransientIntegrationError("The newly registered Jira webhook is not yet visible.");
  }
  if (
    hook.jqlFilter !== `project = ${projectId}` ||
    hook.events.length !== jiraEvents.length ||
    !jiraEvents.every((event) => hook!.events.includes(event))
  )
    throw new PermanentIntegrationError(
      "The Jira webhook no longer matches this source's project and events. Remove the source subscription before recreating it.",
    );
  if (hook.expiresAt - 7 * day <= now) {
    await webhookRequest(context, { method: "PUT", endpoint: "/webhook/refresh", body: { webhookIds: [hook.id] } });
    const previousId = hook.id;
    all = await webhooks(context);
    hook = own();
    if (!hook || hook.id !== previousId || hook.expiresAt - 7 * day <= now)
      throw new TransientIntegrationError("Jira did not confirm the renewed webhook expiration.");
  }
  await save({ webhookId: hook.id, expiresAt: hook.expiresAt, checkedAt: now });
  return { outcome: "ready" };
}
