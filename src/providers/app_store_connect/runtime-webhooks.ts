import type { AppStoreConnectHandlers, IncludedResources } from "./runtime-helpers.ts";

import { rawStringOrNull, optionalBoolean, pickOptionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { requiredInputString } from "../provider-runtime.ts";
import {
  createResource,
  deleteResource,
  getResource,
  indexIncludedResources,
  listPage,
  listResources,
  normalizeResource,
  readAppStoreConnectId,
  readCommaSeparatedList,
  readIncludedResource,
  readRelationshipId,
  readResource,
  readStringList,
  requestAppStoreConnect,
  requireAnyAttribute,
  resourcePath,
  toOneLinkage,
  updateResource,
} from "./runtime-helpers.ts";

const webhookLabel = "App Store Connect webhook";
const deliveryLabel = "App Store Connect webhook delivery";

export const appStoreConnectWebhookHandlers: AppStoreConnectHandlers = {
  async list_webhooks(input, context) {
    const page = await listPage(context, input, {
      path: resourcePath("/v1/apps", readAppStoreConnectId(input.appId, "appId"), "webhooks"),
      label: webhookLabel,
    });
    return { webhooks: page.items, nextCursor: page.nextCursor, total: page.total };
  },

  async get_webhook(input, context) {
    return {
      webhook: await getResource(
        context,
        resourcePath("/v1/webhooks", readAppStoreConnectId(input.webhookId, "webhookId")),
        webhookLabel,
      ),
    };
  },

  async create_webhook(input, context) {
    const webhook = await createResource(context, {
      path: "/v1/webhooks",
      type: "webhooks",
      label: webhookLabel,
      attributes: {
        name: requiredInputString(input.name, "name"),
        url: requiredInputString(input.url, "url"),
        secret: requiredInputString(input.secret, "secret"),
        eventTypes: readEventTypes(input.eventTypes),

        enabled: optionalBoolean(input.enabled) ?? true,
      },
      relationships: {
        app: toOneLinkage("apps", readAppStoreConnectId(input.appId, "appId")),
      },
    });
    return { webhook };
  },

  async update_webhook(input, context) {
    const webhookId = readAppStoreConnectId(input.webhookId, "webhookId");
    const attributes = {
      name: pickOptionalString(input, "name"),
      url: pickOptionalString(input, "url"),
      secret: pickOptionalString(input, "secret"),
      eventTypes: input.eventTypes === undefined ? undefined : readEventTypes(input.eventTypes),
      enabled: optionalBoolean(input.enabled),
    };
    requireAnyAttribute(attributes, "update_webhook needs at least one of name, url, secret, eventTypes or enabled");

    const webhook = await updateResource(context, {
      path: resourcePath("/v1/webhooks", webhookId),
      type: "webhooks",
      id: webhookId,
      label: webhookLabel,
      attributes,
    });
    return { webhook };
  },

  async delete_webhook(input, context) {
    const webhookId = readAppStoreConnectId(input.webhookId, "webhookId");
    await deleteResource(context, resourcePath("/v1/webhooks", webhookId), "Deleting the App Store Connect webhook");
    return { id: webhookId, deleted: true };
  },

  async list_webhook_deliveries(input, context) {
    const page = await listResources(context, input, {
      path: resourcePath("/v1/webhooks", readAppStoreConnectId(input.webhookId, "webhookId"), "deliveries"),
      label: `${deliveryLabel} list`,
      query: {
        "filter[deliveryState]": readCommaSeparatedList(input.deliveryStates),
        "filter[createdDateGreaterThanOrEqualTo]": pickOptionalString(input, "createdSince"),
        "filter[createdDateLessThan]": pickOptionalString(input, "createdBefore"),
        "include": "event",
      },
    });
    return {
      webhookDeliveries: page.resources.map((resource) => readWebhookDelivery(resource, page.included)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  },

  async redeliver_webhook_delivery(input, context) {
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/webhookDeliveries",
      body: {
        data: {
          type: "webhookDeliveries",
          relationships: {
            template: toOneLinkage(
              "webhookDeliveries",
              readAppStoreConnectId(input.webhookDeliveryId, "webhookDeliveryId"),
            ),
          },
        },
      },
    });
    return {
      webhookDelivery: readWebhookDelivery(readResource(payload, deliveryLabel), indexIncludedResources(payload)),
    };
  },

  async ping_webhook(input, context) {
    const webhookId = readAppStoreConnectId(input.webhookId, "webhookId");
    const { payload } = await requestAppStoreConnect(context, {
      method: "POST",
      path: "/v1/webhookPings",
      body: {
        data: {
          type: "webhookPings",
          relationships: { webhook: toOneLinkage("webhooks", webhookId) },
        },
      },
    });
    const ping = normalizeResource(
      readResource(payload, "App Store Connect webhook ping"),
      "App Store Connect webhook ping",
    );
    return { id: ping.id, webhookId };
  },
};

function readEventTypes(value: unknown): string[] {
  const eventTypes = readStringList(value);
  if (!eventTypes?.length) {
    throw new ProviderRequestError(400, "eventTypes must contain at least one event type");
  }
  return eventTypes;
}

export function readWebhookDelivery(
  resource: Record<string, unknown>,
  included: IncludedResources,
): Record<string, unknown> {
  const delivery = normalizeResource(resource, deliveryLabel);
  const event = readIncludedResource(resource, "event", included);
  if (event) {
    return { ...delivery, event: readWebhookEventSummary(event) };
  }

  const eventId = readRelationshipId(resource, "event");
  return {
    ...delivery,
    event: eventId === null ? null : { id: eventId, eventType: null, payload: null, ping: null, createdDate: null },
  };
}

function readWebhookEventSummary(resource: Record<string, unknown>): Record<string, unknown> {
  const event = normalizeResource(resource, "App Store Connect webhook event");
  return {
    id: event.id,
    eventType: rawStringOrNull(event.eventType),
    payload: rawStringOrNull(event.payload),
    ping: optionalBoolean(event.ping) ?? null,
    createdDate: rawStringOrNull(event.createdDate),
  };
}
