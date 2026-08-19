import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailerlite" as const;

const subscriberStatus = s.stringEnum("Subscriber status accepted by the MailerLite API.", [
  "active",
  "unsubscribed",
  "unconfirmed",
  "bounced",
  "junk",
]);
const groupSort = s.stringEnum("Sort order accepted by the MailerLite groups API.", [
  "name",
  "total",
  "open_rate",
  "click_rate",
  "created_at",
  "-name",
  "-total",
  "-open_rate",
  "-click_rate",
  "-created_at",
]);
const fieldType = s.stringEnum("Field type accepted by the MailerLite fields API.", ["text", "number", "date"]);
const fieldSort = s.stringEnum("Sort order accepted by the MailerLite fields API.", ["name", "type", "-name", "-type"]);

const subscriberId = s.nonEmptyString("MailerLite subscriber identifier.");
const groupId = s.nonEmptyString("MailerLite group identifier.");
const timestamp = s.string("Timestamp in yyyy-MM-dd HH:mm:ss format.");
const positiveInteger = (description: string) => s.positiveInteger(description);

const subscriberBodyFields = {
  fields: s.looseObject("Subscriber custom fields accepted by the MailerLite API."),
  groups: s.stringArray("MailerLite group identifiers attached to the subscriber.", {
    minItems: 1,
    itemDescription: "Existing MailerLite group identifier.",
  }),
  status: subscriberStatus,
  subscribed_at: timestamp,
  ip_address: s.string("IP address associated with the subscriber."),
  opted_in_at: timestamp,
  optin_ip: s.string("Opt-in IP address associated with the subscriber."),
  unsubscribed_at: timestamp,
};

const subscriberBodyOptional = [
  "fields",
  "groups",
  "status",
  "subscribed_at",
  "ip_address",
  "opted_in_at",
  "optin_ip",
  "unsubscribed_at",
] as const;

const listSubscribersInputSchema = s.object(
  "Query parameters for listing MailerLite subscribers.",
  {
    status: subscriberStatus,
    limit: positiveInteger("Maximum number of subscribers to return."),
    cursor: s.nonEmptyString("Cursor returned by a previous MailerLite list response."),
    include_groups: s.boolean("Whether to include subscriber groups in the response."),
  },
  { optional: ["status", "limit", "cursor", "include_groups"] },
);

const upsertSubscriberInputSchema = s.object(
  "Request payload for creating or upserting a MailerLite subscriber.",
  {
    email: s.email("Subscriber email address."),
    ...subscriberBodyFields,
    resubscribe: s.boolean("Whether to resubscribe an unsubscribed subscriber when MailerLite allows it."),
  },
  { optional: [...subscriberBodyOptional, "resubscribe"] },
);

const updateSubscriberInputSchema = s.object(
  "Request payload for updating a MailerLite subscriber.",
  {
    subscriber_id: subscriberId,
    ...subscriberBodyFields,
  },
  { optional: subscriberBodyOptional },
);

const singleSubscriberInputSchema = s.object("Path parameters for fetching a MailerLite subscriber.", {
  subscriber_id_or_email: s.nonEmptyString("Subscriber ID or email accepted by the MailerLite fetch endpoint."),
});

const deleteSubscriberInputSchema = s.object("Path parameters for deleting a MailerLite subscriber.", {
  subscriber_id: subscriberId,
});

const listGroupsInputSchema = s.object(
  "Query parameters for listing MailerLite groups.",
  {
    limit: positiveInteger("Maximum number of groups to return."),
    page: positiveInteger("Page number to request from MailerLite."),
    name: s.nonEmptyString("Partial group name filter."),
    sort: groupSort,
  },
  { optional: ["limit", "page", "name", "sort"] },
);

const groupWriteInputSchema = s.object("Request payload accepted by MailerLite group write endpoints.", {
  name: s.string("MailerLite group name.", { minLength: 1, maxLength: 255 }),
});

const updateGroupInputSchema = s.object("Request payload for updating a MailerLite group.", {
  group_id: groupId,
  name: s.string("MailerLite group name.", { minLength: 1, maxLength: 255 }),
});

const groupIdentifierInputSchema = s.object("Path parameters accepted by MailerLite group endpoints.", {
  group_id: groupId,
});

const listGroupSubscribersInputSchema = s.object(
  "Path and query parameters for listing subscribers in a MailerLite group.",
  {
    group_id: groupId,
    status: subscriberStatus,
    limit: s.integer("Maximum number of subscribers to return per page.", { minimum: 1, maximum: 1000 }),
    cursor: s.nonEmptyString("Cursor returned by a previous MailerLite group-subscriber response."),
    include_groups: s.boolean("Whether to include subscriber groups in the response."),
  },
  { optional: ["status", "limit", "cursor", "include_groups"] },
);

const groupMembershipInputSchema = s.object("Path parameters for changing MailerLite group membership.", {
  subscriber_id: subscriberId,
  group_id: groupId,
});

const listFieldsInputSchema = s.object(
  "Query parameters for listing MailerLite fields.",
  {
    limit: positiveInteger("Maximum number of fields to return."),
    page: positiveInteger("Page number to request from MailerLite."),
    keyword: s.nonEmptyString("Partial field keyword filter."),
    type: fieldType,
    sort: fieldSort,
  },
  { optional: ["limit", "page", "keyword", "type", "sort"] },
);

const listOutputSchema = (itemDescription: string) =>
  s.object("Paginated list response returned by the MailerLite API.", {
    data: s.array("Items returned by the MailerLite API.", s.looseObject(itemDescription)),
    links: s.looseObject("Pagination links returned by the MailerLite API."),
    meta: s.looseObject("Pagination metadata returned by the MailerLite API."),
  });

const singleOutputSchema = (description: string) =>
  s.object("Single resource response returned by the MailerLite API.", {
    data: s.looseObject(description),
  });

const successOutputSchema = s.object("Success marker returned after a MailerLite no-content response.", {
  success: s.boolean("Whether MailerLite accepted the operation."),
});

export const mailerliteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_subscribers",
    description: "List subscribers available to the current MailerLite API key.",
    inputSchema: listSubscribersInputSchema,
    outputSchema: listOutputSchema("Subscriber object returned by MailerLite."),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    description: "Fetch a single MailerLite subscriber by ID or email.",
    inputSchema: singleSubscriberInputSchema,
    outputSchema: singleOutputSchema("Subscriber object returned by MailerLite."),
  }),
  defineProviderAction(service, {
    name: "upsert_subscriber",
    description: "Create or update a MailerLite subscriber using the official upsert endpoint.",
    inputSchema: upsertSubscriberInputSchema,
    outputSchema: singleOutputSchema("Subscriber object returned after a MailerLite upsert request."),
  }),
  defineProviderAction(service, {
    name: "update_subscriber",
    description: "Update an existing MailerLite subscriber by ID.",
    inputSchema: updateSubscriberInputSchema,
    outputSchema: singleOutputSchema("Subscriber object returned after a MailerLite update request."),
  }),
  defineProviderAction(service, {
    name: "delete_subscriber",
    description: "Delete a subscriber from the current MailerLite account.",
    inputSchema: deleteSubscriberInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List groups available to the current MailerLite API key.",
    inputSchema: listGroupsInputSchema,
    outputSchema: listOutputSchema("Group object returned by MailerLite."),
  }),
  defineProviderAction(service, {
    name: "create_group",
    description: "Create a new MailerLite group.",
    inputSchema: groupWriteInputSchema,
    outputSchema: singleOutputSchema("Group object returned after a MailerLite create-group request."),
  }),
  defineProviderAction(service, {
    name: "update_group",
    description: "Update an existing MailerLite group by ID.",
    inputSchema: updateGroupInputSchema,
    outputSchema: singleOutputSchema("Group object returned after a MailerLite update-group request."),
  }),
  defineProviderAction(service, {
    name: "delete_group",
    description: "Delete a MailerLite group by ID.",
    inputSchema: groupIdentifierInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_group_subscribers",
    description: "List subscribers that belong to a MailerLite group.",
    inputSchema: listGroupSubscribersInputSchema,
    outputSchema: listOutputSchema("Subscriber object returned by the MailerLite group subscriber endpoint."),
  }),
  defineProviderAction(service, {
    name: "add_subscriber_to_group",
    description: "Assign an existing MailerLite subscriber to a MailerLite group.",
    inputSchema: groupMembershipInputSchema,
    outputSchema: singleOutputSchema("Group object returned after assigning a MailerLite subscriber to a group."),
  }),
  defineProviderAction(service, {
    name: "remove_subscriber_from_group",
    description: "Unassign an existing MailerLite subscriber from a MailerLite group.",
    inputSchema: groupMembershipInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_fields",
    description: "List fields available to the current MailerLite API key.",
    inputSchema: listFieldsInputSchema,
    outputSchema: listOutputSchema("Field object returned by MailerLite."),
  }),
];
