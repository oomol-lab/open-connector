import type { CreateEventSource, EventSource, UpdateEventSource } from "./configuration.ts";
import type { EventSourceDefinition } from "./definition.ts";

import { isJsonObject } from "../common/json.ts";
import { SourceIdentityError } from "./definition.ts";
import { verifySourceHmac } from "./signature.ts";

export const sentryApplication: EventSourceDefinition<
  CreateEventSource,
  UpdateEventSource,
  Pick<
    EventSource,
    | "appId"
    | "installationId"
    | "organizationId"
    | "manageSubscriptions"
    | "verificationTokenConfigured"
    | "encryptKeyConfigured"
    | "signingSecretConfigured"
    | "verifiedAt"
  >
> = {
  kind: "sentry",
  provider: "sentry",
  applicationIngress: true,
  maximumBodyBytes: 64 * 1024,
  initialize(input, accountId) {
    if (input.kind !== "sentry" || !accountId)
      throw new SourceIdentityError("Connector must provide the verified Sentry organization identity.");
    if (input.eventTypes.length !== 1 || input.eventTypes[0] !== "issue.alert")
      throw new SourceIdentityError("Only Sentry Issue Alert Rule notifications are supported.");
    return {
      identity: JSON.stringify([input.teamId, input.connectionId, input.appId, input.installationId, accountId]),
      eventTypes: input.eventTypes,
      config: {
        appId: input.appId,
        installationId: input.installationId,
        organizationId: input.organizationId,
        accountId,
      },
      secrets: { signingSecret: input.signingSecret },
      state: {},
    };
  },
  async verifyIdentity(source, read) {
    const identity = await read(source.config);
    if (
      !isJsonObject(identity) ||
      identity.accountId !== source.config.accountId ||
      identity.appId !== source.config.appId ||
      identity.installationId !== source.config.installationId ||
      typeof identity.organizationSlug !== "string" ||
      typeof identity.organizationId !== "string"
    )
      throw new SourceIdentityError(
        "The Sentry installation does not belong to the connected organization and application.",
      );
    return {
      ...source,
      config: {
        ...source.config,
        organizationSlug: identity.organizationSlug,
        organizationId: identity.organizationId,
      },
    };
  },
  update(source, input) {
    if (input.verificationToken != null || input.encryptKey != null)
      throw new SourceIdentityError("Sentry uses the integration Client Secret.");
    if (input.eventTypes.length !== 1 || input.eventTypes[0] !== "issue.alert")
      throw new SourceIdentityError("Only Sentry Issue Alert Rule notifications are supported.");
    const signingSecret = input.signingSecret ?? source.secrets.signingSecret!;
    return {
      ...source,
      eventTypes: input.eventTypes,
      secrets: { signingSecret },
      state: signingSecret === source.secrets.signingSecret ? source.state : {},
    };
  },
  view(source) {
    return {
      appId: String(source.config.appId),
      installationId: String(source.config.installationId),
      organizationId: String(source.config.organizationId),
      manageSubscriptions: false,
      verificationTokenConfigured: false,
      encryptKeyConfigured: false,
      signingSecretConfigured: true,
      verifiedAt: typeof source.state.verifiedAt === "number" ? new Date(source.state.verifiedAt).toISOString() : null,
    };
  },
  ready: (source) => typeof source.state.verifiedAt === "number",
  async receive(source, bytes, headers, now) {
    const signature = headers.get("sentry-hook-signature") ?? "";
    if (!/^[0-9a-f]{64}$/.test(signature)) throw new TypeError("Invalid Sentry signature.");
    if (!(await verifySourceHmac(bytes, signature, String(source.secrets.signingSecret))))
      throw new TypeError("Invalid Sentry signature.");
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!isJsonObject(payload) || !isJsonObject(payload.installation)) throw new TypeError("Invalid Sentry envelope.");
    if (
      payload.installation.uuid !== source.config.installationId ||
      headers.get("sentry-hook-resource") !== "event_alert" ||
      payload.action !== "triggered"
    )
      return { response: Response.json({}), state: source.state };
    if (!isJsonObject(payload.data) || !isJsonObject(payload.data.event))
      throw new TypeError("Invalid Sentry issue alert.");
    const event = payload.data.event;
    if (
      typeof event.event_id !== "string" ||
      !event.event_id ||
      typeof event.issue_id !== "string" ||
      !event.issue_id ||
      typeof payload.data.triggered_rule !== "string" ||
      !payload.data.triggered_rule
    )
      throw new TypeError("Incomplete Sentry issue alert.");
    const deliveryId = JSON.stringify([source.config.installationId, event.event_id, payload.data.triggered_rule]);
    return {
      state: { ...source.state, verifiedAt: now },
      event: {
        id: deliveryId,
        type: "issue.alert",
        payload: {
          event: "issue.alert",
          deliveryId,
          organizationId: source.config.organizationId!,
          issueId: event.issue_id,
          body: payload.data,
        },
      },
    };
  },
  matches(config, event) {
    if (!Array.isArray(config.eventTypes) || !config.eventTypes.includes(event.type)) return false;
    const body = event.payload.body;
    if (!isJsonObject(body) || !isJsonObject(body.event)) return false;
    if (
      Array.isArray(config.projectIds) &&
      config.projectIds.length > 0 &&
      !config.projectIds.includes(String(body.event.project))
    )
      return false;
    return (
      !Array.isArray(config.ruleNames) ||
      config.ruleNames.length === 0 ||
      config.ruleNames.includes(body.triggered_rule!)
    );
  },
  resources: { triggerId: "sentry.on_issue_alert", requests: () => [] },
};
