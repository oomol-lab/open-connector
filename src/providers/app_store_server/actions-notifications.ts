import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  millisecondTimestamp,
  nonEmptyString,
  notificationPayload,
  notificationSubtypes,
  notificationTypes,
  sendAttemptOutput,
  service,
} from "./schemas.ts";

export const appStoreServerNotificationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "request_test_notification",
    operationType: "write",
    description:
      "Ask the App Store to send a TEST notification to the App Store Server Notifications URL configured for your app, and get back the token that identifies the attempt. Fails when no notification URL is configured for the selected environment.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {},
      [],
      "No input. The notification goes to the URL configured for the app and environment of this connection.",
    ),
    outputSchema: s.actionOutput(
      {
        testNotificationToken: s.nullableString(
          "Token that identifies the test notification. Pass it to get_test_notification_status to see what the App Store delivered.",
        ),
      },
      "The token identifying the test notification the App Store sent.",
    ),
    followUpActions: ["app_store_server.get_test_notification_status"],
  }),
  defineProviderAction(service, {
    name: "get_test_notification_status",
    operationType: "read",
    description:
      "Read the delivery result of a test notification, with the notification payload decoded from the signed payload Apple returns. Apple answers 404 until it has finished the first delivery attempt.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        testNotificationToken: nonEmptyString("Token returned by request_test_notification for the attempt to check."),
      },
      ["testNotificationToken"],
      "Identifies the test notification to check.",
    ),
    outputSchema: s.actionOutput(
      {
        notification: s.nullable(notificationPayload),
        sendAttempts: sendAttemptOutput,
      },
      "The test notification the App Store sent and how delivery went.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_notification_history",
    operationType: "read",
    description:
      "List the App Store Server Notifications the App Store tried to deliver to your server in a time span, with each notification payload decoded. History covers the past 180 days in production and the past 30 days in sandbox, and returns up to 20 records per page.",
    requiredScopes: [],
    inputSchema: s.object(
      "The time span and filters for the notification history to return.",
      {
        startDate: millisecondTimestamp(
          "Start of the time span. Must be within the past 180 days in production, or the past 30 days in sandbox.",
        ),
        endDate: millisecondTimestamp(
          "End of the time span, later than startDate. Apple uses the current time when this is in the future.",
        ),
        notificationType: s.stringEnum(
          "Return only notifications of this type. Cannot be combined with transactionId.",
          notificationTypes,
        ),
        notificationSubtype: s.stringEnum(
          "Return only notifications with this subtype. Requires notificationType, and the pair has to be a combination Apple sends.",
          notificationSubtypes,
        ),
        transactionId: nonEmptyString(
          "Return only notifications about this customer, given any of their transaction identifiers. Cannot be combined with notificationType.",
        ),
        onlyFailures: s.boolean(
          "Set to true to return only notifications that have not reached your server, including the ones Apple is still retrying.",
        ),
        paginationToken: nonEmptyString(
          "Page token taken from the paginationToken value of a previous response. Repeat every other filter unchanged when you page.",
        ),
      },
      { required: ["startDate", "endDate"] },
    ),
    outputSchema: s.actionOutput(
      {
        notifications: s.array(
          "Notification history records returned for this page.",
          s.object(
            "One notification the App Store tried to deliver.",
            {
              notification: s.nullable(notificationPayload),
              sendAttempts: sendAttemptOutput,
            },
            { required: ["notification", "sendAttempts"] },
          ),
        ),
        paginationToken: s.nullableString(
          "Token to pass back as paginationToken to read the next page, or null when this was the last page.",
        ),
        hasMore: s.nullableBoolean("Whether more pages are available for this query."),
      },
      "A page of notification history.",
    ),
  }),
];
