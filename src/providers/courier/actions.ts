import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "courier";

function nonEmptyString(description: string) {
  return s.string({ description, minLength: 1, pattern: "\\S" });
}

const userIdSchema = nonEmptyString("The Courier user ID associated with the profile.");
const listIdSchema = nonEmptyString("The Courier list ID.");
const cursorSchema = nonEmptyString("The Courier pagination cursor for the next page.");
const patternSchema = nonEmptyString("The Courier list pattern filter.");
const idempotencyKeySchema = nonEmptyString(
  "The optional Courier Idempotency-Key header value used to deduplicate a logical send request.",
);

const looseObjectSchema = s.looseObject("An object returned by the Courier API.");
const profileSchema = s.looseObject("The Courier profile object to merge into the user profile.");
const preferencesSchema = s.looseObject("The Courier recipient preferences object.");
const rawSchema = s.looseObject("The raw Courier API response payload.");

const pagingSchema = s.object("Courier pagination metadata.", {
  cursor: s.nullable(s.string("The cursor for the next page when Courier returns one.")),
  more: s.boolean("Whether Courier reports more records after this page."),
});

const listSchema = s.object("A Courier subscription list.", {
  id: s.string("The Courier list ID."),
  name: s.string("The Courier list name."),
  created: s.nullable(s.string("The timestamp when Courier reports the list was created.")),
  updated: s.nullable(s.string("The timestamp when Courier reports the list was last updated.")),
  raw: looseObjectSchema,
});

const listSubscriptionSchema = s.object("A Courier list subscription record.", {
  recipientId: s.string("The subscribed Courier recipient ID."),
  created: s.nullable(s.string("The timestamp when Courier reports the subscription was created.")),
  preferences: s.nullable(preferencesSchema),
  raw: looseObjectSchema,
});

const addSubscriberSchema = s.object(
  "One Courier list subscription to add without replacing existing subscriptions.",
  {
    recipientId: nonEmptyString("The Courier recipient ID to subscribe."),
    preferences: preferencesSchema,
  },
  { optional: ["preferences"] },
);

const sendMessageAction = defineProviderAction(service, {
  name: "send_message",
  description: "Send a Courier message to one or more recipients.",
  inputSchema: s.object(
    "The input payload for sending a Courier message.",
    {
      message: s.looseObject("The Courier message object passed to POST /send."),
      idempotencyKey: idempotencyKeySchema,
    },
    { optional: ["idempotencyKey"] },
  ),
  outputSchema: s.object("The response returned after sending a Courier message.", {
    requestId: s.unknown(
      "The Courier requestId value. Single-recipient sends return a string; multi-recipient sends may return a structured value.",
    ),
    raw: rawSchema,
  }),
});

const getProfileAction = defineProviderAction(service, {
  name: "get_profile",
  description: "Return a Courier user profile and preferences by user ID.",
  inputSchema: s.object("The input payload for reading a Courier profile.", {
    userId: userIdSchema,
  }),
  outputSchema: s.object("The response returned for a Courier user profile.", {
    userId: s.string("The Courier user ID used for the request."),
    profile: profileSchema,
    preferences: s.nullable(preferencesSchema),
    raw: rawSchema,
  }),
});

const mergeProfileAction = defineProviderAction(service, {
  name: "merge_profile",
  description: "Merge values into a Courier user profile or create it when missing.",
  inputSchema: s.object("The input payload for merging a Courier profile.", {
    userId: userIdSchema,
    profile: profileSchema,
  }),
  outputSchema: s.object("The response returned after merging a Courier profile.", {
    userId: s.string("The Courier user ID used for the request."),
    status: s.nullable(s.string("The Courier merge status when present.")),
    raw: rawSchema,
  }),
});

const deleteProfileAction = defineProviderAction(service, {
  name: "delete_profile",
  description: "Delete a Courier user profile by user ID.",
  inputSchema: s.object("The input payload for deleting a Courier profile.", {
    userId: userIdSchema,
  }),
  outputSchema: s.object("The response returned after deleting a Courier profile.", {
    userId: s.string("The Courier user ID used for the request."),
    success: s.boolean("Whether the delete request completed successfully."),
    statusCode: s.integer("The HTTP status code returned by Courier."),
  }),
});

const listListsAction = defineProviderAction(service, {
  name: "list_lists",
  description: "List Courier subscription lists with optional cursor and pattern filters.",
  inputSchema: s.object(
    "The input payload for listing Courier subscription lists.",
    {
      cursor: cursorSchema,
      pattern: patternSchema,
    },
    { optional: ["cursor", "pattern"] },
  ),
  outputSchema: s.object("The response returned when listing Courier subscription lists.", {
    paging: pagingSchema,
    lists: s.array("The Courier subscription lists returned for this page.", listSchema),
    raw: rawSchema,
  }),
});

const getListAction = defineProviderAction(service, {
  name: "get_list",
  description: "Return a Courier subscription list by list ID.",
  inputSchema: s.object("The input payload for reading a Courier subscription list.", {
    listId: listIdSchema,
  }),
  outputSchema: s.object("The response returned for a Courier subscription list.", {
    list: listSchema,
    raw: rawSchema,
  }),
});

const upsertListAction = defineProviderAction(service, {
  name: "upsert_list",
  description: "Create or replace a Courier subscription list.",
  inputSchema: s.object(
    "The input payload for creating or replacing a Courier subscription list.",
    {
      listId: listIdSchema,
      name: nonEmptyString("The Courier subscription list name."),
      preferences: preferencesSchema,
    },
    { optional: ["preferences"] },
  ),
  outputSchema: s.object("The response returned after upserting a Courier subscription list.", {
    listId: s.string("The Courier list ID used for the request."),
    success: s.boolean("Whether the upsert request completed successfully."),
    statusCode: s.integer("The HTTP status code returned by Courier."),
  }),
});

const deleteListAction = defineProviderAction(service, {
  name: "delete_list",
  description: "Delete a Courier subscription list by list ID.",
  inputSchema: s.object("The input payload for deleting a Courier subscription list.", {
    listId: listIdSchema,
  }),
  outputSchema: s.object("The response returned after deleting a Courier subscription list.", {
    listId: s.string("The Courier list ID used for the request."),
    success: s.boolean("Whether the delete request completed successfully."),
    statusCode: s.integer("The HTTP status code returned by Courier."),
  }),
});

const listListSubscriptionsAction = defineProviderAction(service, {
  name: "list_list_subscriptions",
  description: "List subscriptions for a Courier subscription list.",
  inputSchema: s.object(
    "The input payload for listing Courier list subscriptions.",
    {
      listId: listIdSchema,
      cursor: cursorSchema,
    },
    { optional: ["cursor"] },
  ),
  outputSchema: s.object("The response returned when listing Courier list subscriptions.", {
    listId: s.string("The Courier list ID used for the request."),
    paging: pagingSchema,
    subscriptions: s.array("The Courier list subscriptions returned for this page.", listSubscriptionSchema),
    raw: rawSchema,
  }),
});

const addListSubscribersAction = defineProviderAction(service, {
  name: "add_list_subscribers",
  description: "Add Courier recipients to a subscription list without replacing existing members.",
  inputSchema: s.object("The input payload for adding Courier list subscribers.", {
    listId: listIdSchema,
    recipients: s.array("The Courier recipients to subscribe.", addSubscriberSchema, {
      minItems: 1,
    }),
  }),
  outputSchema: s.object("The response returned after adding Courier list subscribers.", {
    listId: s.string("The Courier list ID used for the request."),
    success: s.boolean("Whether the subscription request completed successfully."),
    statusCode: s.integer("The HTTP status code returned by Courier."),
  }),
});

const unsubscribeListSubscriberAction = defineProviderAction(service, {
  name: "unsubscribe_list_subscriber",
  description: "Unsubscribe one Courier user profile from a subscription list.",
  inputSchema: s.object("The input payload for unsubscribing a Courier list subscriber.", {
    listId: listIdSchema,
    userId: userIdSchema,
  }),
  outputSchema: s.object("The response returned after unsubscribing a Courier list subscriber.", {
    listId: s.string("The Courier list ID used for the request."),
    userId: s.string("The Courier user ID used for the request."),
    success: s.boolean("Whether the unsubscribe request completed successfully."),
    statusCode: s.integer("The HTTP status code returned by Courier."),
  }),
});

export const courierActions: readonly ActionDefinition[] = [
  sendMessageAction,
  getProfileAction,
  mergeProfileAction,
  deleteProfileAction,
  listListsAction,
  getListAction,
  upsertListAction,
  deleteListAction,
  listListSubscriptionsAction,
  addListSubscribersAction,
  unsubscribeListSubscriberAction,
];
