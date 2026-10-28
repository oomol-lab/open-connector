import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const email = s.string("Subscriber email address.", { format: "email" });
const developerMode = s.boolean("Return fake data without changing production data when true.");
const name = s.string("Subscriber name.");
const phone = s.string("Subscriber phone number in E.164 format.");
const status = s.stringEnum("Subscriber status; unsubscribed_subscriber opts the subscriber out.", [
  "free_subscriber",
  "paid_subscriber",
  "unsubscribed_subscriber",
]);
const segmentationLists = s.array(
  "Segmentation list IDs obtained from Pingback support.",
  s.string("Segmentation list ID.", { minLength: 1 }),
);
const subscriber = s.object(
  "Subscriber record, including additional upstream fields.",
  {
    id: s.string("Subscriber ID."),
    email,
    name,
    phone: s.nullable(phone),
    status,
    customFields: s.array("Subscriber custom fields.", s.looseObject("Custom field record.", {})),
    segmentationLists,
    blacklistedAt: s.nullable(s.string("Date the subscriber was blacklisted.")),
    unsubscribedAt: s.nullable(s.string("Date the subscriber unsubscribed.")),
    createdAt: s.string("Subscriber creation date."),
    updatedAt: s.string("Subscriber update date."),
  },
  {
    required: ["email"],
    additionalProperties: true,
  },
);
const membership = s.object(
  "Segmentation membership record.",
  {
    id: s.string("Membership ID."),
    email,
    subscriberId: s.string("Subscriber ID."),
    segmentationListId: s.string("Segmentation list ID."),
    createdAt: s.string("Membership creation date."),
    updatedAt: s.string("Membership update date."),
  },
  {
    required: [],
    additionalProperties: true,
  },
);
const subscriberOutput = s.object(
  "Pingback subscriber response.",
  {
    data: subscriber,
    requestId: s.string("Pingback request ID for support."),
  },
  {
    required: ["data"],
    additionalProperties: true,
  },
);
const pingbackActions: ActionDefinition[] = [
  defineProviderAction("pingback", {
    name: "create_subscriber",
    operationType: "write",
    description: "Create a Pingback subscriber with optional custom fields and segmentation lists.",
    requiredScopes: [],
    inputSchema: s.object(
      "Create subscriber parameters.",
      {
        email,
        name,
        phone,
        status,
        segmentationLists,
        developerMode,
        customFields: s.array(
          "Custom fields to set by label.",
          s.requiredObject("Custom field value.", {
            label: s.string("Custom field label."),
            value: s.string("Custom field value."),
          }),
        ),
      },
      { required: ["email"] },
    ),
    outputSchema: subscriberOutput,
  }),
  defineProviderAction("pingback", {
    name: "get_subscriber",
    operationType: "read",
    description: "Get a Pingback subscriber by email address.",
    requiredScopes: [],
    inputSchema: s.object("Get subscriber parameters.", { email, developerMode }, { optional: ["developerMode"] }),
    outputSchema: subscriberOutput,
  }),
  defineProviderAction("pingback", {
    name: "update_subscriber",
    operationType: "destructive",
    description: "Update a Pingback subscriber by email, including status changes that can unsubscribe them.",
    requiredScopes: [],
    inputSchema: s.object(
      "Update subscriber parameters.",
      {
        email,
        name,
        phone,
        status,
        developerMode,
        customFields: s.array(
          "Custom fields to update by ID.",
          s.requiredObject("Custom field update.", {
            id: s.string("Custom field ID obtained from Pingback support.", { minLength: 1 }),
            value: s.string("Custom field value."),
          }),
        ),
      },
      { required: ["email"] },
    ),
    outputSchema: subscriberOutput,
  }),
  defineProviderAction("pingback", {
    name: "add_subscriber_to_segments",
    operationType: "write",
    description: "Add an existing Pingback subscriber to segmentation lists.",
    requiredScopes: [],
    inputSchema: s.object(
      "Add segmentation memberships parameters.",
      { email, segmentationLists, developerMode },
      { optional: ["developerMode"] },
    ),
    outputSchema: s.object(
      "Pingback added memberships response.",
      {
        data: s.array("Added segmentation memberships.", membership),
        requestId: s.string("Pingback request ID for support."),
      },
      {
        required: ["data"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction("pingback", {
    name: "remove_subscriber_from_segment",
    operationType: "write",
    description: "Remove a subscriber from one Pingback segmentation list while retaining the subscriber.",
    requiredScopes: [],
    inputSchema: s.object(
      "Remove segmentation membership parameters.",
      {
        email,
        segmentationId: s.string("Segmentation list ID.", { minLength: 1 }),
        developerMode,
      },
      { optional: ["developerMode"] },
    ),
    outputSchema: s.object(
      "Pingback removed membership response.",
      {
        data: membership,
        requestId: s.string("Pingback request ID for support."),
      },
      {
        required: ["data"],
        additionalProperties: true,
      },
    ),
  }),
];
export default pingbackActions;
