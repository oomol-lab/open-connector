import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition } from "./definition.ts";

import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";

const events = new Set(["jira:issue_created", "jira:issue_updated", "comment_created"]);
export const jiraProject: EventSourceDefinition<
  CreateEventSource,
  UpdateEventSource,
  Pick<
    EventSource,
    | "appId"
    | "projectId"
    | "projectKey"
    | "subscriptionStatus"
    | "lastError"
    | "manageSubscriptions"
    | "verificationTokenConfigured"
    | "encryptKeyConfigured"
    | "verifiedAt"
  >
> = {
  kind: "jira",
  provider: "jira",
  maximumBodyBytes: 64 * 1024,
  initialize(input, accountId) {
    if (input.kind !== "jira" || !accountId?.startsWith("jira:"))
      throw new SourceIdentityError("Choose a verified Jira Cloud OAuth connection.");
    if (input.eventTypes.some((event) => !events.has(event))) throw new SourceIdentityError("Unsupported Jira event.");
    return {
      identity: JSON.stringify([input.teamId, input.connectionId, accountId]),
      eventTypes: input.eventTypes,
      config: { accountId, project: input.project },
      secrets: {},
      state: {},
    };
  },
  async verifyIdentity(source, read) {
    const identity = await read(source.config);
    if (
      !isJsonObject(identity) ||
      identity.accountId !== source.config.accountId ||
      typeof identity.cloudId !== "string" ||
      typeof identity.userId !== "string" ||
      typeof identity.projectId !== "string" ||
      !/^\d+$/.test(identity.projectId) ||
      typeof identity.projectKey !== "string" ||
      typeof identity.siteUrl !== "string"
    )
      throw new SourceIdentityError("Jira did not return the selected project and site identity.");
    if (
      source.config.projectId != null &&
      (source.config.cloudId !== identity.cloudId ||
        source.config.projectId !== identity.projectId ||
        source.config.userId !== identity.userId)
    )
      throw new SourceIdentityError("The Jira project, site or user changed. Recreate the event source.");
    return {
      ...source,
      identity:
        source.config.projectId == null
          ? JSON.stringify([source.identity, identity.cloudId, identity.projectId, identity.userId])
          : source.identity,
      config: { ...source.config, ...identity },
    };
  },
  update(source, input) {
    if (input.verificationToken != null || input.encryptKey != null || input.signingSecret != null)
      throw new SourceIdentityError("Jira OAuth callback verification is owned by Connector.");
    if (input.eventTypes.some((event) => !events.has(event))) throw new SourceIdentityError("Unsupported Jira event.");
    return { ...source, eventTypes: input.eventTypes };
  },
  view(source, now = Date.now()) {
    const expired =
      isJsonObject(source.state.resource) &&
      typeof source.state.resource.expiresAt === "number" &&
      source.state.resource.expiresAt <= now;
    const status = expired ? "error" : source.state.resourceStatus;
    return {
      appId: String(source.config.cloudId),
      projectId: String(source.config.projectId),
      projectKey: String(source.config.projectKey),
      subscriptionStatus: status === "pending" || status === "ready" || status === "error" ? status : "idle",
      lastError: expired
        ? "The Jira webhook expired. Restore Connector access and retry publication."
        : typeof source.state.lastError === "string"
          ? source.state.lastError
          : undefined,
      manageSubscriptions: true,
      verificationTokenConfigured: false,
      encryptKeyConfigured: false,
      verifiedAt: typeof source.state.verifiedAt === "number" ? new Date(source.state.verifiedAt).toISOString() : null,
    };
  },
  expiresAt: (source) =>
    isJsonObject(source.state.resource) && typeof source.state.resource.expiresAt === "number"
      ? source.state.resource.expiresAt
      : undefined,
  ready: (source, now = Date.now()) =>
    source.state.resourceStatus === "ready" &&
    isJsonObject(source.state.resource) &&
    typeof source.state.resource.expiresAt === "number" &&
    source.state.resource.expiresAt > now,
  async receive(source, bytes, headers, _now, execute) {
    if (
      !isJsonObject(source.state.resource) ||
      typeof source.state.resource.webhookId !== "number" ||
      source.state.resourceStatus !== "ready"
    )
      return { response: new Response(null, { status: 503 }), state: source.state };
    if (execute == null) throw new SourceIdentityError("Jira callback verification is unavailable.");
    const result = await execute({
      operation: "sourceReceive",
      config: { ...source.config, webhookId: source.state.resource.webhookId },
      headers: {
        authorization: headers.get("authorization") ?? "",
        "x-atlassian-webhook-identifier": headers.get("x-atlassian-webhook-identifier") ?? "",
      },
      rawBody: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    });
    if (!isJsonObject(result)) throw new SourceIdentityError("Invalid Jira verification response.");
    if (result.outcome === "unauthorized")
      return { response: new Response(null, { status: 401 }), state: source.state };
    if (result.outcome === "ignored") return { response: Response.json({}), state: source.state };
    if (
      result.outcome !== "event" ||
      typeof result.id !== "string" ||
      typeof result.type !== "string" ||
      !events.has(result.type) ||
      !isJsonObject(result.payload)
    )
      throw new SourceIdentityError("Invalid Jira verified event.");
    return { event: { id: result.id, type: result.type, payload: result.payload } };
  },
  matches: (config, event) => Array.isArray(config.eventTypes) && config.eventTypes.includes(event.type),
  resources: {
    triggerId: "jira.on_issue_event",
    managed: true,
    requests(source, _provider, _config, endpointUrl) {
      if (!endpointUrl) throw new SourceIdentityError("Jira requires a public callback URL.");
      return [{ key: "project", config: { projectId: source.config.projectId!, endpointUrl } }];
    },
  },
};
