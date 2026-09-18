import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zammad";

const idSchema = s.positiveInteger("The numeric Zammad resource ID.");
const pageSchema = {
  page: s.positiveInteger("The one-based result page number."),
  perPage: s.positiveInteger("The maximum number of records to return on this page."),
};
const ticketSchema = s.looseObject("A Zammad ticket object.", {
  id: idSchema,
  number: s.string("The human-readable ticket number."),
  title: s.string("The ticket title."),
  group_id: s.integer("The assigned group ID."),
  customer_id: s.integer("The customer user ID."),
  state_id: s.integer("The ticket state ID."),
  priority_id: s.integer("The ticket priority ID."),
});
const userSchema = s.looseObject("A Zammad user object.", {
  id: idSchema,
  login: s.string("The user login."),
  firstname: s.string("The user's first name."),
  lastname: s.string("The user's last name."),
  email: s.string("The user's email address."),
});
const articleSchema = s.looseObject("A Zammad ticket article object.", {
  id: idSchema,
  ticket_id: s.integer("The parent ticket ID."),
  body: s.string("The article body."),
  content_type: s.string("The article body content type."),
  internal: s.boolean("Whether the article is internal."),
});
const expandSchema = { expand: s.boolean("Whether to expand named relations in the response.") };

export const zammadActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the Zammad user associated with the connected access token.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving the current Zammad user.", {}),
    outputSchema: s.object("The current Zammad user response.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "list_tickets",
    operationType: "read",
    description: "List tickets visible to the connected Zammad user.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing Zammad tickets.",
      { ...pageSchema, ...expandSchema },
      { optional: ["page", "perPage", "expand"] },
    ),
    outputSchema: s.object("The Zammad ticket list response.", {
      tickets: s.array("Tickets returned by Zammad.", ticketSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_tickets",
    operationType: "read",
    description: "Search Zammad tickets with the endpoint search syntax.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for searching Zammad tickets.",
      {
        query: s.nonEmptyString("The Zammad ticket search query."),
        ...pageSchema,
        ...expandSchema,
        sortBy: s.string("The upstream ticket field used to sort results."),
        orderBy: s.stringEnum("The result sort direction.", ["asc", "desc"]),
      },
      { optional: ["page", "perPage", "expand", "sortBy", "orderBy"] },
    ),
    outputSchema: s.object("The Zammad ticket search response.", {
      tickets: s.array("Tickets matching the query.", ticketSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    operationType: "read",
    description: "Retrieve one Zammad ticket by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving a Zammad ticket.",
      { ticketId: idSchema, ...expandSchema },
      { optional: ["expand"] },
    ),
    outputSchema: s.object("The Zammad ticket response.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "create_ticket",
    operationType: "write",
    description: "Create a Zammad ticket with its initial text article.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for creating a Zammad ticket.",
      {
        title: s.nonEmptyString("The ticket title."),
        group: s.nonEmptyString("The target group name."),
        customer: s.nonEmptyString("The customer login or email address."),
        body: s.nonEmptyString("The initial article body."),
        articleType: s.stringEnum("The initial article type.", ["note", "email", "phone"]),
        contentType: s.stringEnum("The initial article content type.", ["text/plain", "text/html"]),
        internal: s.boolean("Whether the initial article is internal."),
        subject: s.string("The initial article subject."),
        sender: s.stringEnum("The initial article sender role.", ["Agent", "Customer", "System"]),
        priority: s.string("The ticket priority name."),
        state: s.string("The ticket state name."),
      },
      {
        optional: ["articleType", "contentType", "internal", "subject", "sender", "priority", "state"],
      },
    ),
    outputSchema: s.object("The created Zammad ticket response.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "update_ticket",
    operationType: "write",
    description: "Update documented mutable fields on a Zammad ticket.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for updating a Zammad ticket.",
      {
        ticketId: idSchema,
        title: s.nonEmptyString("The replacement ticket title."),
        group: s.nonEmptyString("The replacement group name."),
        customer: s.nonEmptyString("The replacement customer login or email address."),
        owner: s.nonEmptyString("The replacement owner login or email address."),
        priority: s.string("The replacement priority name."),
        state: s.string("The replacement state name."),
        pendingTime: s.string("The pending-until timestamp expected by Zammad."),
      },
      { optional: ["title", "group", "customer", "owner", "priority", "state", "pendingTime"] },
    ),
    outputSchema: s.object("The updated Zammad ticket response.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "list_ticket_articles",
    operationType: "read",
    description: "List articles belonging to a Zammad ticket.",
    requiredScopes: [],
    inputSchema: s.object("The input for listing Zammad ticket articles.", { ticketId: idSchema }),
    outputSchema: s.object("The Zammad ticket article list response.", {
      articles: s.array("Articles belonging to the ticket.", articleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_ticket_article",
    operationType: "write",
    description: "Add a text article to an existing Zammad ticket.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for creating a Zammad ticket article.",
      {
        ticketId: idSchema,
        body: s.nonEmptyString("The article body."),
        articleType: s.stringEnum("The article type.", ["note", "email", "phone"]),
        contentType: s.stringEnum("The article content type.", ["text/plain", "text/html"]),
        internal: s.boolean("Whether the article is internal."),
        subject: s.string("The article subject when applicable."),
        sender: s.stringEnum("The article sender role.", ["Agent", "Customer", "System"]),
      },
      { optional: ["articleType", "contentType", "internal", "subject", "sender"] },
    ),
    outputSchema: s.object("The created Zammad ticket article response.", {
      article: articleSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_users",
    operationType: "read",
    description: "Search Zammad users by login, email, name, or endpoint search expression.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for searching Zammad users.",
      { query: s.nonEmptyString("The Zammad user search query."), ...pageSchema, ...expandSchema },
      { optional: ["page", "perPage", "expand"] },
    ),
    outputSchema: s.object("The Zammad user search response.", {
      users: s.array("Users matching the query.", userSchema),
    }),
  }),
];
