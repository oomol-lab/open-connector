import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "doppler_marketing_automation" as const;

const rawObjectSchema = s.looseObject("The raw object returned by Doppler Email Marketing.");

const listIdSchema = s.positiveInteger("The Doppler subscriber list ID.");

const paginationFields = {
  page: s.positiveInteger("The one-based page number to request."),
  perPage: s.integer("The number of records to return per page.", {
    minimum: 1,
    maximum: 100,
  }),
} as const;

const paginationOptionalKeys = ["page", "perPage"] as const;

const listSchema = s.requiredObject("A normalized Doppler subscriber list.", {
  listId: s.integer("The Doppler list ID."),
  name: s.string("The list name."),
  currentStatus: s.nullable(s.string("The current list processing status.")),
  subscribersCount: s.nullable(s.integer("The number of subscribers in the list.")),
  creationDate: s.nullable(s.string("The list creation timestamp.")),
  hasScheduledCampaigns: s.nullable(s.boolean("Whether the list has scheduled campaigns when reported.")),
  hasFormsAssociated: s.nullable(s.boolean("Whether the list has associated forms when reported.")),
  hasSegmentsAssociated: s.nullable(s.boolean("Whether the list has associated segments when reported.")),
  hasEventsAssociated: s.nullable(s.boolean("Whether the list has associated events when reported.")),
  data: rawObjectSchema,
});

const paginationOutputFields = {
  pageSize: s.nullable(s.integer("The number of records in the returned page.")),
  itemsCount: s.nullable(s.integer("The total number of matching records.")),
  currentPage: s.nullable(s.integer("The current page number.")),
  pagesCount: s.nullable(s.integer("The total number of available pages.")),
  lastPage: s.nullable(s.integer("The last page number when reported.")),
} as const;

const fieldValueSchema = s.object(
  "A Doppler custom field value.",
  {
    name: s.nonEmptyString("The Doppler custom field name.", {
      maxLength: 50,
      pattern: "^[0-9a-zA-ZñÑ]+$",
    }),
    value: s.nullable(s.string("The custom field value.", { maxLength: 400 })),
  },
  { optional: ["value"] },
);

const subscriberSchema = s.requiredObject("A normalized Doppler subscriber.", {
  email: s.email("The subscriber email address."),
  fields: s.array("The subscriber custom fields.", rawObjectSchema),
  belongsToLists: s.array("The lists to which the subscriber belongs.", s.string("A Doppler list identifier or name.")),
  status: s.nullable(s.string("The current subscriber status.")),
  unsubscriptionDate: s.nullable(s.string("The subscriber unsubscription timestamp.")),
  canBeReactivated: s.nullable(s.boolean("Whether the subscriber can currently be reactivated.")),
  isBeingReactivated: s.nullable(s.boolean("Whether subscriber reactivation is currently in progress.")),
  unsubscriptionType: s.nullable(s.string("The reason category for the subscriber unsubscription.")),
  manualUnsubscriptionReason: s.nullable(s.string("The detailed manual unsubscription reason.")),
  unsubscriptionComment: s.nullable(s.string("The comment recorded for a manual unsubscription.")),
  score: s.nullable(s.integer("The subscriber engagement score.")),
  data: rawObjectSchema,
});

const messageOutputSchema = s.requiredObject("A Doppler operation result.", {
  message: s.string("The result message returned by Doppler."),
  data: rawObjectSchema,
});

export const dopplerMarketingAutomationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_lists",
    operationType: "read",
    description: "List Doppler Email Marketing subscriber lists with optional pagination.",
    inputSchema: s.object("Pagination for listing Doppler subscriber lists.", paginationFields, {
      optional: paginationOptionalKeys,
    }),
    outputSchema: s.requiredObject("The paginated Doppler subscriber lists.", {
      lists: s.array("The subscriber lists returned by Doppler.", listSchema),
      ...paginationOutputFields,
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_list",
    operationType: "read",
    description: "Retrieve one Doppler Email Marketing subscriber list by ID.",
    inputSchema: s.requiredObject("The list to retrieve.", {
      listId: listIdSchema,
    }),
    outputSchema: s.requiredObject("The requested Doppler subscriber list.", {
      list: listSchema,
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_list",
    operationType: "write",
    description: "Create a Doppler Email Marketing subscriber list.",
    inputSchema: s.requiredObject("The subscriber list to create.", {
      name: s.nonEmptyString("The new list name.", {
        maxLength: 100,
      }),
    }),
    outputSchema: s.requiredObject("The Doppler list creation result.", {
      createdResourceId: s.nullable(s.string("The ID of the created list.")),
      message: s.string("The result message returned by Doppler."),
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_list",
    operationType: "write",
    description: "Rename a Doppler Email Marketing subscriber list.",
    inputSchema: s.requiredObject("The subscriber list update.", {
      listId: listIdSchema,
      name: s.nonEmptyString("The updated list name.", {
        maxLength: 100,
      }),
    }),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_list",
    operationType: "destructive",
    description: "Remove a Doppler Email Marketing list while leaving its contacts in the account.",
    inputSchema: s.requiredObject("The subscriber list to remove.", {
      listId: listIdSchema,
    }),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_subscribers",
    operationType: "read",
    description: "List subscribers across a Doppler Email Marketing account.",
    inputSchema: s.object("Pagination for listing account subscribers.", paginationFields, {
      optional: paginationOptionalKeys,
    }),
    outputSchema: s.requiredObject("The paginated Doppler subscribers.", {
      subscribers: s.array("The subscribers returned by Doppler.", subscriberSchema),
      ...paginationOutputFields,
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_list_subscribers",
    operationType: "read",
    description: "List subscribers associated with a Doppler Email Marketing list.",
    inputSchema: s.object(
      "The list and pagination for retrieving associated subscribers.",
      {
        listId: listIdSchema,
        ...paginationFields,
      },
      { optional: paginationOptionalKeys },
    ),
    outputSchema: s.requiredObject("The paginated Doppler list subscribers.", {
      subscribers: s.array("The subscribers returned by Doppler.", subscriberSchema),
      ...paginationOutputFields,
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    operationType: "read",
    description: "Retrieve one Doppler Email Marketing subscriber by email address.",
    inputSchema: s.requiredObject("The subscriber to retrieve.", {
      email: s.email("The subscriber email address.", {
        maxLength: 100,
      }),
    }),
    outputSchema: s.requiredObject("The requested Doppler subscriber.", {
      subscriber: subscriberSchema,
      data: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_subscriber_to_list",
    operationType: "write",
    description: "Create or update a Doppler subscriber and associate the subscriber with a list.",
    inputSchema: s.object(
      "The subscriber and list association to create.",
      {
        listId: listIdSchema,
        email: s.email("The subscriber email address.", {
          maxLength: 100,
        }),
        fields: s.array("Custom field values to set on the subscriber.", fieldValueSchema),
      },
      { optional: ["fields"] },
    ),
    outputSchema: messageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "remove_subscriber_from_list",
    operationType: "destructive",
    description: "Remove a subscriber from a Doppler list without deleting the subscriber from the account.",
    inputSchema: s.requiredObject("The subscriber and list association to remove.", {
      listId: listIdSchema,
      email: s.email("The subscriber email address.", {
        maxLength: 100,
      }),
    }),
    outputSchema: messageOutputSchema,
  }),
];

export type DopplerMarketingAutomationActionName =
  | "list_lists"
  | "get_list"
  | "create_list"
  | "update_list"
  | "delete_list"
  | "list_subscribers"
  | "list_list_subscribers"
  | "get_subscriber"
  | "add_subscriber_to_list"
  | "remove_subscriber_from_list";
