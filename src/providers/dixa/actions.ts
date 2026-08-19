import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dixa";

const pageLimitSchema = s.positiveInteger(
  "The maximum number of results per page. May be used with pageKey between page requests.",
);
const pageKeySchema = s.nonEmptyString(
  "The base64 encoded pagination key returned by Dixa. Do not construct or modify it.",
);
const emailSchema = s.email("The email address filter.");
const phoneSchema = s.nonEmptyString("The phone number filter.");
const dixaMetaSchema = s.looseObject("Pagination metadata returned by Dixa.", {
  previous: s.string("The previous page URL."),
  next: s.string("The next page URL."),
});
const dixaRawSchema = s.looseObject("The raw Dixa response payload.");

const dixaUserSchema = s.looseObject("A Dixa agent, admin, or end user.", {
  id: s.string("The Dixa user ID."),
  createdAt: s.string("The time when the user was created."),
  displayName: s.string("The user's display name."),
  email: s.string("The user's primary email address."),
  avatarUrl: s.string("The URL for the user's avatar."),
  phoneNumber: s.string("The user's primary phone number."),
  additionalEmails: s.array("Additional email addresses for the user.", s.string("An email.")),
  additionalPhoneNumbers: s.array("Additional phone numbers for the user.", s.string("A phone number.")),
  firstName: s.string("The user's first name."),
  lastName: s.string("The user's last name."),
  middleNames: s.array("The user's middle names.", s.string("A middle name.")),
  roles: s.array("The user's roles.", s.string("A Dixa role.")),
  externalId: s.string("The custom external identifier for the end user."),
  customAttributes: s.array("Custom attributes returned for the end user.", s.looseObject("A Dixa custom attribute.")),
});

const listUsersOutputSchema = s.object(
  "A paginated Dixa user list response.",
  {
    data: s.array("The Dixa users returned by the request.", dixaUserSchema),
    meta: dixaMetaSchema,
    raw: dixaRawSchema,
  },
  { optional: ["meta"] },
);

const singleUserOutputSchema = s.object("A single Dixa user response.", {
  data: dixaUserSchema,
  raw: dixaRawSchema,
});

const userListFilterInputSchema = s.object(
  "Input for listing Dixa users.",
  {
    pageLimit: pageLimitSchema,
    pageKey: pageKeySchema,
    email: emailSchema,
    phone: phoneSchema,
  },
  { optional: ["pageLimit", "pageKey", "email", "phone"] },
);

const endUserListFilterInputSchema = s.object(
  "Input for listing Dixa end users.",
  {
    pageLimit: pageLimitSchema,
    pageKey: pageKeySchema,
    email: emailSchema,
    phone: phoneSchema,
    externalId: s.nonEmptyString("The external ID filter."),
  },
  { optional: ["pageLimit", "pageKey", "email", "phone", "externalId"] },
);

const userIdInputSchema = s.object("Input for retrieving a Dixa user.", {
  id: s.nonEmptyString("The Dixa user ID."),
});

const presenceSchema = s.looseObject("A Dixa presence record.", {
  userId: s.string("The Dixa user ID."),
  requestTime: s.string("The request time reported by Dixa."),
  lastSeen: s.string("The last time the user was seen."),
  presenceStatus: s.stringEnum("The Dixa presence status.", ["Away", "Working"]),
  connectionStatus: s.stringEnum("The Dixa connection status.", ["Offline", "Online"]),
  activeChannels: s.array("The active Dixa channels.", s.string("A channel name.")),
});

const conversationIdInputSchema = s.object("Input for retrieving a Dixa conversation.", {
  conversationId: s.positiveInteger("The Dixa conversation ID."),
});

const looseDixaDataSchema = s.looseObject("A Dixa response object.");

export const dixaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_agents",
    description: "List Dixa agents and admins with optional email or phone filtering.",
    inputSchema: userListFilterInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_agent",
    description: "Get one Dixa agent or admin by ID.",
    inputSchema: userIdInputSchema,
    outputSchema: singleUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_presence",
    description: "List presence status for Dixa agents and admins.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: s.object("Dixa presence status records.", {
      data: s.array("Presence records returned by Dixa.", presenceSchema),
      raw: dixaRawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_end_users",
    description: "List Dixa end users with optional email, phone, or external ID filtering.",
    inputSchema: endUserListFilterInputSchema,
    outputSchema: listUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_end_user",
    description: "Get one Dixa end user by ID.",
    inputSchema: userIdInputSchema,
    outputSchema: singleUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_conversation",
    description: "Get one Dixa conversation by ID.",
    inputSchema: conversationIdInputSchema,
    outputSchema: s.object("A Dixa conversation response.", {
      data: looseDixaDataSchema,
      raw: dixaRawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_conversation_messages",
    description: "List all messages for a Dixa conversation from oldest to newest.",
    inputSchema: conversationIdInputSchema,
    outputSchema: s.object("Dixa conversation messages.", {
      data: s.array("The Dixa messages returned by the request.", looseDixaDataSchema),
      raw: dixaRawSchema,
    }),
  }),
];
