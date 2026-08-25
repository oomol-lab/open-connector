import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mobile_text_alerts";

const subscriberIdSchema = s.nonEmptyString(
  "The subscriber id, phone number, or email address used to identify the subscriber.",
);

const subscriberSchema = s.looseObject("A Mobile Text Alerts subscriber.", {
  id: s.number("The subscriber id."),
  firstName: s.string("The subscriber first name."),
  lastName: s.string("The subscriber last name."),
  email: s.string("The subscriber email address."),
  number: s.number("The subscriber phone number as a number."),
  e164Number: s.string("The subscriber phone number in E.164 format."),
  date: s.string("The date when the subscriber was created."),
  countryId: s.number("The subscriber country id."),
  groups: s.array(
    "The groups assigned to the subscriber.",
    s.looseObject("A group assigned to the subscriber.", {
      id: s.number("The group id."),
      name: s.string("The group name."),
      addedToGroupAt: s.string("The date when the subscriber was added to the group."),
    }),
  ),
  subscriberFieldData: s.array(
    "The custom field values assigned to the subscriber.",
    s.looseObject("A custom subscriber field value.", {
      id: s.number("The custom field value id."),
      subscriberFieldId: s.number("The custom subscriber field id."),
      data: s.string("The custom field value."),
    }),
  ),
  signupMethod: s.nullable(s.number("The signup method id when available.")),
  longNumber: s.number("The subscriber long phone number."),
  carrierId: s.number("The subscriber carrier id."),
});

const subscriberMutationFields = {
  firstName: s.string("The subscriber first name."),
  lastName: s.string("The subscriber last name."),
  email: s.email("The subscriber email address."),
  number: s.anyOf("The subscriber phone number.", [
    s.number("The subscriber phone number as a number."),
    s.nonEmptyString("The subscriber phone number as a string."),
  ]),
  e164Number: s.nonEmptyString("The subscriber phone number in E.164 format."),
  groupIds: s.array("The group ids to assign to the subscriber.", s.number("A group id.")),
  subscriberFields: s.record(
    "Custom subscriber field ids mapped to their string values.",
    s.string("A custom subscriber field value."),
  ),
};

const optionalMutationFields = Object.keys(subscriberMutationFields);

const createSubscriberInputSchema = {
  ...s.object("The input payload for creating a Mobile Text Alerts subscriber.", subscriberMutationFields, {
    optional: optionalMutationFields,
  }),
  anyOf: [{ required: ["email"] }, { required: ["number"] }],
};

const updateSubscriberInputSchema = {
  ...s.object(
    "The input payload for updating a Mobile Text Alerts subscriber.",
    { subscriberId: subscriberIdSchema, ...subscriberMutationFields },
    { optional: optionalMutationFields },
  ),
  minProperties: 2,
};

const subscriberOutputSchema = s.object("The normalized subscriber response.", {
  subscriber: subscriberSchema,
  message: s.string("The provider response message."),
});

export const mobileTextAlertsActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_subscribers",
    description: "List and search subscribers in Mobile Text Alerts.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Mobile Text Alerts subscribers.",
      {
        page: s.nonNegativeInteger("The zero-based page number."),
        pageSize: s.positiveInteger("The number of subscribers per page, up to 1000.", {
          maximum: 1000,
        }),
        query: s.nonEmptyString("A free-text search across subscriber names, numbers, emails, and custom fields."),
        sortBy: s.nonEmptyString("The subscriber field used to sort the result."),
        sortDirection: s.stringEnum("The result sort direction.", ["asc", "desc", "ASC", "DESC"]),
        allSubscribers: s.boolean("Whether to return all subscribers in the result."),
      },
      { optional: ["page", "pageSize", "query", "sortBy", "sortDirection", "allSubscribers"] },
    ),
    outputSchema: s.object("The paginated Mobile Text Alerts subscriber result.", {
      subscribers: s.array("The subscribers returned for this page.", subscriberSchema),
      page: s.nonNegativeInteger("The zero-based page number returned by the provider."),
      pageSize: s.nonNegativeInteger("The page size returned by the provider."),
      total: s.nonNegativeInteger("The total number of matching subscribers."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    description: "Get a Mobile Text Alerts subscriber by id, phone number, or email address.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting a Mobile Text Alerts subscriber.", {
      subscriberId: subscriberIdSchema,
    }),
    outputSchema: subscriberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_subscriber",
    description: "Create or update a Mobile Text Alerts subscriber by phone number or email.",
    requiredScopes: [],
    inputSchema: createSubscriberInputSchema,
    outputSchema: subscriberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_subscriber",
    description: "Update a Mobile Text Alerts subscriber by id, phone number, or email address.",
    requiredScopes: [],
    inputSchema: updateSubscriberInputSchema,
    outputSchema: subscriberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_subscriber",
    description: "Delete a Mobile Text Alerts subscriber by id, phone number, or email address.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting a Mobile Text Alerts subscriber.", {
      subscriberId: subscriberIdSchema,
    }),
    outputSchema: s.object("The normalized subscriber deletion result.", {
      deleted: s.boolean("Whether the subscriber was deleted."),
      message: s.string("The provider response message."),
    }),
  }),
];
