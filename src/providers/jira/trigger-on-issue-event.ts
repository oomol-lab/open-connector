import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { JsonValue } from "../../triggers/common/types.ts";

import { jwtVerify } from "jose";
import { IntegrationConnectionError } from "../../triggers/common/integration.ts";
import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { webhookRequest } from "../../triggers/managed-webhook.ts";
import { jiraProject } from "../../triggers/sources/jira.ts";
import { snapshot } from "./trigger-on-issue-event.definition.ts";
import { reconcileJiraResource, requireJiraCloud, jiraEvents } from "./trigger-resource.ts";

export const jiraIssueEvents: IntegrationDefinition = {
  snapshot,
  eventSource: "jira",
  source: jiraProject,
  resources: { reconcile: reconcileJiraResource },
  async sourceIdentity(context) {
    const cloudId = requireJiraCloud(context.connector);
    const project = context.config.projectId ?? context.config.project;
    if (typeof project !== "string" || !project || project.length > 256)
      throw new PermanentIntegrationError("Choose a Jira project.");
    const [projectResult, userResult, siteResult] = await Promise.all([
      webhookRequest(context, { method: "GET", endpoint: `/project/${encodeURIComponent(project)}` }),
      webhookRequest(context, { method: "GET", endpoint: "/myself" }),
      webhookRequest(context, { method: "GET", endpoint: "/serverInfo" }),
    ]);
    const item = projectResult.data,
      user = userResult.data,
      site = siteResult.data;
    if (
      !isJsonObject(item) ||
      typeof item.id !== "string" ||
      !/^\d+$/.test(item.id) ||
      typeof item.key !== "string" ||
      !isJsonObject(user) ||
      typeof user.accountId !== "string" ||
      !isJsonObject(site) ||
      typeof site.baseUrl !== "string"
    )
      throw new PermanentIntegrationError("Jira did not return a verified project, user and site.");
    const url = new URL(site.baseUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new PermanentIntegrationError("Invalid Jira Cloud site URL.");
    return {
      accountId: context.connector.providerAccountId!,
      cloudId,
      userId: user.accountId,
      projectId: item.id,
      projectKey: item.key,
      siteUrl: url.origin,
    };
  },
  async sourceReceive(context): Promise<Readonly<Record<string, JsonValue>>> {
    const cloudId = requireJiraCloud(context.connector);
    if (context.config.cloudId !== cloudId)
      throw new IntegrationConnectionError("The Jira connection belongs to another site.");
    const authorization = context.headers.authorization ?? "";
    if (!authorization.startsWith("Bearer ")) return { outcome: "unauthorized" };
    try {
      await jwtVerify(
        authorization.slice(7),
        new TextEncoder().encode(context.connector.oauthClientConfig!.clientSecret!),
        { algorithms: ["HS256"], currentDate: context.now, requiredClaims: ["exp"] },
      );
    } catch {
      return { outcome: "unauthorized" };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(context.rawBody);
    } catch {
      return { outcome: "unauthorized" };
    }
    if (
      !isJsonObject(payload) ||
      typeof payload.webhookEvent !== "string" ||
      !jiraEvents.includes(payload.webhookEvent)
    )
      return { outcome: "ignored" };
    if (!Array.isArray(payload.matchedWebhookIds) || !payload.matchedWebhookIds.includes(context.config.webhookId!))
      return { outcome: "ignored" };
    const issue = payload.issue;
    if (
      !isJsonObject(issue) ||
      typeof issue.id !== "string" ||
      typeof issue.self !== "string" ||
      !isJsonObject(issue.fields) ||
      !isJsonObject(issue.fields.project) ||
      issue.fields.project.id !== context.config.projectId
    )
      return { outcome: "ignored" };
    let issueUrl: URL;
    try {
      issueUrl = new URL(issue.self);
    } catch {
      return { outcome: "ignored" };
    }
    if (issueUrl.origin !== context.config.siteUrl) return { outcome: "ignored" };
    const id = context.headers["x-atlassian-webhook-identifier"];
    if (!id || id.length > 256) return { outcome: "unauthorized" };
    if (
      payload.webhookEvent === "comment_created" &&
      (!isJsonObject(payload.comment) || typeof payload.comment.id !== "string")
    )
      return { outcome: "unauthorized" };
    return {
      outcome: "event",
      id,
      type: payload.webhookEvent,
      payload: { event: payload.webhookEvent, deliveryId: id, cloudId, issueId: issue.id, body: payload },
    };
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
      throw new PermanentIntegrationError("Invalid shared Jira event.");
    return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
  },
  async reconcile() {
    throw new PermanentIntegrationError("This deployment does not support shared Jira event sources.");
  },
};
