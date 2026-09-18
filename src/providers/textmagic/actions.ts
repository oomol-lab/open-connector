import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "textmagic";

const paginationProperties = {
  page: s.integer("The one-based results page to fetch.", { minimum: 1 }),
  limit: s.integer("The number of resources to return per page.", { minimum: 1 }),
};

const userSchema = s.looseRequiredObject("A Textmagic user account.", {
  id: s.integer("The Textmagic user ID."),
  username: s.string("The Textmagic username."),
  firstName: s.string("The account first name."),
  lastName: s.string("The account last name."),
  email: s.email("The account email address."),
  balance: s.number("The account balance in the account currency."),
  currency: s.string("The account currency code."),
});

const contactSchema = s.looseRequiredObject(
  "A Textmagic contact.",
  {
    id: s.integer("The Textmagic contact ID."),
    favorited: s.boolean("Whether the contact is favorited."),
    blocked: s.boolean("Whether the contact is blocked."),
    firstName: s.nullableString("The contact first name."),
    lastName: s.nullableString("The contact last name."),
    companyName: s.nullableString("The contact company name."),
    phone: s.nullableString("The contact phone number in E.164 format."),
    email: s.nullable(s.email("The contact email address.")),
  },
  { optional: ["favorited", "blocked", "firstName", "lastName", "companyName", "phone", "email"] },
);

const listSchema = s.looseRequiredObject(
  "A Textmagic contact list.",
  {
    id: s.integer("The Textmagic list ID."),
    name: s.string("The list name."),
    description: s.nullableString("The list description."),
    favorited: s.boolean("Whether the list is favorited."),
    membersCount: s.integer("The number of contacts in the list."),
    shared: s.nullableBoolean("Whether subaccounts can access the list."),
    isDefault: s.nullableBoolean("Whether new web contacts use this list by default."),
  },
  { optional: ["description", "favorited", "membersCount", "shared", "isDefault"] },
);

const templateSchema = s.looseRequiredObject("A Textmagic message template.", {
  id: s.integer("The Textmagic template ID."),
  name: s.string("The template name."),
  content: s.string("The template text, which may contain Textmagic dynamic fields."),
  lastModified: s.nullableString("The template last-modified timestamp."),
});

function paginatedOutputSchema(
  description: string,
  resourceDescription: string,
  resourceSchema: JsonSchema,
): JsonSchema {
  return s.object(
    {
      page: s.integer("The current results page."),
      pageCount: s.integer("The total number of results pages."),
      limit: s.integer("The number of resources per page."),
      resources: s.array(resourceDescription, resourceSchema),
    },
    { required: ["page", "pageCount", "limit", "resources"], description },
  );
}

export const textmagicActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get the Textmagic account associated with the connected API credentials.",
    inputSchema: s.object({}, { description: "Input for getting the current Textmagic account." }),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "send_message",
    operationType: "write",
    description: "Send a plain-text SMS message to up to 1,000 phone numbers through Textmagic.",
    inputSchema: s.object(
      {
        text: s.nonEmptyString("The SMS message text."),
        phones: s.stringArray("Recipient phone numbers in E.164 format without separators.", {
          minItems: 1,
          maxItems: 1000,
          itemDescription: "One recipient phone number in E.164 format without separators.",
        }),
        from: s.nonEmptyString("An allowed Textmagic phone number or alphanumeric sender ID."),
        referenceId: s.integer("A custom integer reference ID for delivery callbacks."),
        cutExtra: s.boolean("Whether Textmagic should truncate text beyond partsCount."),
        partsCount: s.integer("The maximum number of SMS message parts.", { minimum: 1, maximum: 6 }),
        local: s.boolean("Whether recipient numbers should be interpreted as local numbers."),
        localCountry: s.string("The two-letter country code used when local is true.", {
          minLength: 2,
          maxLength: 2,
        }),
      },
      {
        required: ["text", "phones"],
        optional: ["from", "referenceId", "cutExtra", "partsCount", "local", "localCountry"],
        description: "Input for sending a Textmagic SMS message.",
      },
    ),
    outputSchema: s.object(
      {
        id: s.integer("The created message, session, schedule, or bulk ID."),
        href: s.string("The relative URI of the created Textmagic resource."),
        type: s.stringEnum("The kind of Textmagic resource created for the submission.", [
          "message",
          "session",
          "schedule",
          "bulk",
        ]),
        sessionId: s.nullableInteger("The message session ID when one was created."),
        bulkId: s.nullableInteger("The bulk session ID when asynchronous processing was required."),
        messageId: s.nullableInteger("The message ID for a single-recipient submission."),
        scheduleId: s.nullableInteger("The schedule ID when a scheduled message was created."),
        chatId: s.nullableInteger("The chat ID when a chat was created."),
      },
      {
        required: ["id", "href", "type", "sessionId", "bulkId", "messageId", "scheduleId", "chatId"],
        description: "The Textmagic message submission result.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List contacts in the connected Textmagic account.",
    inputSchema: s.object(
      {
        ...paginationProperties,
        shared: s.integer("Whether shared contacts should be included, using 0 or 1.", {
          minimum: 0,
          maximum: 1,
        }),
        orderBy: s.stringEnum("The field used to order contacts.", ["id", "firstName", "lastName"]),
        direction: s.stringEnum("The contact ordering direction.", ["asc", "desc"]),
      },
      {
        optional: ["page", "limit", "shared", "orderBy", "direction"],
        description: "Filters and pagination for listing Textmagic contacts.",
      },
    ),
    outputSchema: paginatedOutputSchema(
      "A page of Textmagic contacts.",
      "Contacts on the requested page.",
      contactSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get one Textmagic contact by ID.",
    inputSchema: s.object(
      { id: s.positiveInteger("The Textmagic contact ID.") },
      { required: ["id"], description: "Input for getting a Textmagic contact." },
    ),
    outputSchema: contactSchema,
  }),
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List contact lists in the connected Textmagic account.",
    inputSchema: s.object(
      {
        ...paginationProperties,
        orderBy: s.stringEnum("The field used to order contact lists.", ["id", "firstName", "lastName"]),
        direction: s.stringEnum("The contact-list ordering direction.", ["asc", "desc"]),
        favoriteOnly: s.integer("Whether only favorited lists should be returned, using 0 or 1.", {
          minimum: 0,
          maximum: 1,
        }),
        onlyMine: s.integer("Whether only current-user lists should be returned, using 0 or 1.", {
          minimum: 0,
          maximum: 1,
        }),
      },
      {
        optional: ["page", "limit", "orderBy", "direction", "favoriteOnly", "onlyMine"],
        description: "Filters and pagination for listing Textmagic contact lists.",
      },
    ),
    outputSchema: paginatedOutputSchema(
      "A page of Textmagic contact lists.",
      "Contact lists on the requested page.",
      listSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "create_list",
    operationType: "write",
    description: "Create a contact list in Textmagic.",
    inputSchema: s.object(
      {
        name: s.nonEmptyString("The contact-list name."),
        shared: s.boolean("Whether subaccounts can access the new list."),
        favorited: s.boolean("Whether the new list should be favorited."),
        isDefault: s.boolean("Whether new web contacts should use this list by default."),
      },
      {
        required: ["name"],
        optional: ["shared", "favorited", "isDefault"],
        description: "Input for creating a Textmagic contact list.",
      },
    ),
    outputSchema: s.object(
      {
        id: s.integer("The created Textmagic list ID."),
        href: s.string("The relative URI of the created Textmagic list."),
      },
      { required: ["id", "href"], description: "The created Textmagic contact-list link." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List SMS message templates in the connected Textmagic account.",
    inputSchema: s.object(paginationProperties, {
      optional: ["page", "limit"],
      description: "Pagination options accepted by Textmagic.",
    }),
    outputSchema: paginatedOutputSchema(
      "A page of Textmagic message templates.",
      "Message templates on the requested page.",
      templateSchema,
    ),
  }),
];
