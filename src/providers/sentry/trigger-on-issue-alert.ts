import type { IntegrationDefinition } from "../../triggers/common/integration.ts";

import { PermanentIntegrationError } from "../../triggers/common/integration.ts";
import { isJsonObject } from "../../triggers/common/json.ts";
import { webhookRequest } from "../../triggers/managed-webhook.ts";
import { sentryApplication } from "../../triggers/sources/sentry.ts";
import { snapshot } from "./trigger-on-issue-alert.definition.ts";

export const sentryIssueAlert: IntegrationDefinition = {
  snapshot,
  eventSource: "sentry",
  source: sentryApplication,
  async sourceIdentity(context) {
    const accountId = context.connector.providerAccountId;
    const { appId, installationId, organizationId } = context.config;
    if (
      !accountId ||
      typeof organizationId !== "string" ||
      !organizationId ||
      typeof appId !== "string" ||
      !appId ||
      typeof installationId !== "string" ||
      !installationId
    )
      throw new PermanentIntegrationError(
        "Sentry requires a verified organization, application UUID and installation UUID.",
      );
    const organizationResponse = await webhookRequest(context, {
      method: "GET",
      endpoint: `/organizations/${encodeURIComponent(organizationId)}/`,
    });
    const organization = organizationResponse.data;
    if (!isJsonObject(organization) || typeof organization.id !== "string" || typeof organization.slug !== "string")
      throw new PermanentIntegrationError("Invalid Sentry organization response.");
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const result = await webhookRequest(context, {
        method: "GET",
        endpoint: `/organizations/${encodeURIComponent(organizationId)}/sentry-app-installations/`,
        query: cursor == null ? {} : { cursor },
      });
      if (!Array.isArray(result.data)) throw new PermanentIntegrationError("Invalid Sentry installations response.");
      for (const item of result.data) {
        if (!isJsonObject(item) || !isJsonObject(item.app) || !isJsonObject(item.organization))
          throw new PermanentIntegrationError("Invalid Sentry installation.");
        if (item.uuid !== installationId) continue;
        if (item.app.uuid !== appId || item.status !== "installed" || item.organization.slug !== organization.slug)
          throw new PermanentIntegrationError("Sentry integration is not installed in the connected organization.");
        return {
          accountId,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          appId,
          installationId,
        };
      }
      const next = (result.headers?.link ?? "")
        .split(",")
        .find((link) => /rel="next"/.test(link) && /results="true"/.test(link));
      if (next == null) break;
      const match = /cursor="([^"]+)"/.exec(next);
      if (!match || seen.has(match[1]!)) throw new PermanentIntegrationError("Invalid Sentry installation pagination.");
      cursor = match[1]!;
      seen.add(cursor);
    }
    throw new PermanentIntegrationError("Install the selected Sentry integration in the connected organization first.");
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
      throw new PermanentIntegrationError("Invalid shared Sentry event.");
    return { outcome: "event", dedupeKey: payload.deliveryId, outputs: payload };
  },
  async reconcile() {
    throw new PermanentIntegrationError("This deployment does not support shared Sentry event sources.");
  },
};
