import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { service } from "./schemas.ts";
import {
  deletedOutput,
  manageAppStoreRoles,
  nonEmptyString,
  nullableEnum,
  pageOutput,
  paginationInputs,
  resourceObject,
  urlString,
} from "./schemas.ts";

export const webhookEventTypes: readonly string[] = [
  "ALTERNATIVE_DISTRIBUTION_PACKAGE_AVAILABLE_UPDATED",
  "ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED",
  "ALTERNATIVE_DISTRIBUTION_TERRITORY_AVAILABILITY_UPDATED",
  "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED",
  "BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED",
  "BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED",
  "BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED",
  "BACKGROUND_ASSET_VERSION_STATE_UPDATED",
  "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED",
  "BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED",
  "BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED",
  "BUILD_UPLOAD_STATE_UPDATED",
] as const;
export const webhookDeliveryStates: readonly string[] = ["SUCCEEDED", "FAILED", "PENDING"];

const eventTypeItem = s.stringEnum("An App Store Connect webhook event type.", webhookEventTypes);
const eventTypesInput = (description: string) =>
  s.array(description, eventTypeItem, { minItems: 1, uniqueItems: true });
const webhookIdInput = nonEmptyString("App Store Connect identifier of the webhook.");
const secretDescriptionTail =
  "App Store Connect uses to sign every notification: the x-apple-signature header carries hmacsha256=<hex HMAC-SHA256 of the request body>. Choose a value that is hard to guess.";
const secretDescription = `Shared secret ${secretDescriptionTail}`;

export const webhookResource: JsonSchema = resourceObject(
  "A webhook registered on an app.",
  "App Store Connect identifier for the webhook.",
  {
    name: s.nullableString("Display name of the webhook."),
    url: s.nullableString("HTTPS endpoint App Store Connect posts notifications to."),
    enabled: s.nullableBoolean("Whether App Store Connect currently sends notifications to the webhook."),
    eventTypes: s.nullable(s.array("Event types the webhook is subscribed to.", eventTypeItem)),
  },
);

export const webhookEventSummary: JsonSchema = s.nullable(
  s.object(
    "The event the delivery carried, or null when App Store Connect did not return it.",
    {
      id: s.string("App Store Connect identifier for the webhook event."),
      eventType: nullableEnum("Type of the event.", webhookEventTypes),
      payload: s.nullableString("JSON text of the notification body App Store Connect sent."),
      ping: s.nullableBoolean("Whether the event was a test ping rather than an app event."),
      createdDate: s.nullableString("When the event was created, as an ISO 8601 timestamp."),
    },
    { additionalProperties: true, required: ["id"] },
  ),
);

export const webhookDeliveryResource: JsonSchema = resourceObject(
  "One attempt to deliver a webhook event to the configured URL.",
  "App Store Connect identifier for the delivery.",
  {
    createdDate: s.nullableString("When the delivery was created, as an ISO 8601 timestamp."),
    sentDate: s.nullableString("When the request was sent to the webhook URL, as an ISO 8601 timestamp."),
    deliveryState: nullableEnum("Outcome of the delivery.", webhookDeliveryStates),
    errorMessage: s.nullableString("Error App Store Connect recorded when the delivery failed."),
    redelivery: s.nullableBoolean("Whether this delivery was a redelivery of an earlier one."),
    request: s.nullable(
      s.looseObject("The request App Store Connect sent.", {
        url: s.nullableString("URL the notification was posted to."),
      }),
    ),
    response: s.nullable(
      s.looseObject("The response the webhook URL returned.", {
        httpStatusCode: s.nullableInteger("HTTP status code the webhook URL answered with."),
        body: s.nullableString("Response body the webhook URL returned."),
      }),
    ),
    event: webhookEventSummary,
  },
  ["event"],
);

export const appStoreConnectWebhookActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_webhooks",
    operationType: "read",
    description:
      "List the webhooks registered on one app, with the URL, enabled state, and subscribed event types of each.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the app whose webhooks to list.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app."),
        ...paginationInputs,
      },
      { required: ["appId"] },
    ),
    outputSchema: pageOutput(
      "webhooks",
      webhookResource,
      "Webhooks returned for this page.",
      "A page of webhooks registered on one app.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_webhook",
    operationType: "read",
    description: "Read one webhook by its App Store Connect identifier.",
    requiredScopes: [],
    inputSchema: s.actionInput({ webhookId: webhookIdInput }, ["webhookId"], "Identifies the webhook to read."),
    outputSchema: s.actionOutput({ webhook: webhookResource }, "The requested webhook."),
  }),
  defineProviderAction(service, {
    name: "create_webhook",
    operationType: "write",
    description:
      "Register a webhook on an app so App Store Connect posts a signed notification to the URL whenever one of the chosen events happens. Use ping_webhook afterwards to test the endpoint.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The webhook to register.",
      {
        appId: nonEmptyString("App Store Connect identifier of the app the webhook belongs to."),
        name: nonEmptyString("Display name for the webhook."),
        url: urlString("HTTPS endpoint App Store Connect posts notifications to."),
        secret: nonEmptyString(secretDescription),
        eventTypes: eventTypesInput("Event types the webhook receives."),
        enabled: s.boolean("Whether the webhook starts enabled. Defaults to true."),
      },
      { required: ["appId", "name", "url", "secret", "eventTypes"] },
    ),
    outputSchema: s.actionOutput({ webhook: webhookResource }, "The created webhook."),
  }),
  defineProviderAction(service, {
    name: "update_webhook",
    operationType: "destructive",
    description:
      "Change the name, URL, secret, event types, or enabled state of a webhook. Each given field replaces the current value; eventTypes replaces the whole list.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.object(
      "The webhook fields to change. At least one field besides webhookId is required.",
      {
        webhookId: webhookIdInput,
        name: nonEmptyString("New display name for the webhook."),
        url: urlString("New HTTPS endpoint App Store Connect posts notifications to."),
        secret: nonEmptyString(`New shared secret ${secretDescriptionTail}`),
        eventTypes: eventTypesInput("New list of event types the webhook receives."),
        enabled: s.boolean("Enable or disable notifications for the webhook."),
      },
      { required: ["webhookId"] },
    ),
    outputSchema: s.actionOutput({ webhook: webhookResource }, "The updated webhook."),
  }),
  defineProviderAction(service, {
    name: "delete_webhook",
    operationType: "destructive",
    description:
      "Delete a webhook. App Store Connect stops sending notifications to its URL and its delivery history is no longer reachable.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput({ webhookId: webhookIdInput }, ["webhookId"], "Identifies the webhook to delete."),
    outputSchema: s.actionOutput(
      deletedOutput("App Store Connect identifier of the deleted webhook."),
      "Confirmation that the webhook was deleted.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_webhook_deliveries",
    operationType: "read",
    description:
      "List the delivery attempts of one webhook, newest first as App Store Connect orders them, with the event each attempt carried and the response the endpoint returned. Filter by delivery state or creation time to find failed deliveries to resend.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for browsing the deliveries of one webhook.",
      {
        webhookId: webhookIdInput,
        deliveryStates: s.array(
          "Return only deliveries in these states.",
          s.stringEnum("A webhook delivery state.", webhookDeliveryStates),
          { minItems: 1, uniqueItems: true },
        ),
        createdSince: s.dateTime("Return only deliveries created at or after this ISO 8601 timestamp."),
        createdBefore: s.dateTime("Return only deliveries created before this ISO 8601 timestamp."),
        ...paginationInputs,
      },
      { required: ["webhookId"] },
    ),
    outputSchema: pageOutput(
      "webhookDeliveries",
      webhookDeliveryResource,
      "Delivery attempts returned for this page.",
      "A page of delivery attempts for one webhook.",
    ),
  }),
  defineProviderAction(service, {
    name: "redeliver_webhook_delivery",
    operationType: "write",
    description:
      "Send the event of an earlier delivery again, for example after the endpoint was down. App Store Connect creates a new delivery marked as a redelivery; the original delivery record is kept.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput(
      {
        webhookDeliveryId: nonEmptyString("App Store Connect identifier of the delivery whose event to send again."),
      },
      ["webhookDeliveryId"],
      "Identifies the delivery to repeat.",
    ),
    outputSchema: s.actionOutput(
      { webhookDelivery: webhookDeliveryResource },
      "The new delivery created for the resend.",
    ),
  }),
  defineProviderAction(service, {
    name: "ping_webhook",
    operationType: "write",
    description:
      "Send a test ping notification to a webhook so the endpoint and its signature check can be verified. The ping shows up in the webhook deliveries with ping set to true.",
    requiredScopes: [],
    providerPermissions: [...manageAppStoreRoles],
    inputSchema: s.actionInput({ webhookId: webhookIdInput }, ["webhookId"], "Identifies the webhook to ping."),
    outputSchema: s.actionOutput(
      {
        id: s.string("App Store Connect identifier for the ping."),
        webhookId: s.string("The webhook the ping was sent to."),
      },
      "Confirmation that the ping was queued.",
    ),
  }),
];
