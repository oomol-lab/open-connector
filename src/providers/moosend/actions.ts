import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "moosend";

const formatSchema = s.literal("json", {
  description: "Moosend response format. Connector actions always request JSON.",
});

const sortBySchema = s.stringEnum("Moosend mailing list property used to sort results.", [
  "Name",
  "Subject",
  "Status",
  "DeliveredOn",
  "CreatedOn",
]);

const sortMethodSchema = s.stringEnum("Moosend sorting direction.", ["ASC", "DESC"]);

const subscriberStatusSchema = s.stringEnum("Moosend subscriber status filter.", [
  "Subscribed",
  "Unsubscribed",
  "Bounced",
  "Removed",
]);

const customFieldSchema = s.looseObject("A Moosend custom field returned for a subscriber.", {
  CustomFieldID: s.string("The Moosend custom field identifier."),
  Name: s.string("The Moosend custom field name."),
  Value: s.nullable(s.string("The Moosend custom field value.")),
});

const subscriberSchema = s.looseObject("A Moosend subscriber object.", {
  ID: s.string("The Moosend subscriber identifier."),
  Name: s.nullable(s.string("The subscriber name.")),
  Email: s.email("The subscriber email address."),
  CreatedOn: s.string("The Moosend date string when the subscriber was created."),
  UpdatedOn: s.string("The Moosend date string when the subscriber was updated."),
  UnsubscribedOn: s.nullable(s.string("The Moosend date string when the subscriber unsubscribed from the list.")),
  UnsubscribedFromID: s.nullable(s.string("The identifier that the subscriber unsubscribed from.")),
  SubscribeType: s.integer("The Moosend numeric subscriber status."),
  SubscribeMethod: s.integer("The Moosend numeric subscription method."),
  CustomFields: s.array("The custom fields associated with the subscriber.", customFieldSchema),
  RemovedOn: s.nullable(s.string("The Moosend date string when the subscriber was removed.")),
  Tags: s.array("The tags associated with the subscriber.", s.string("One subscriber tag.")),
  Preferences: s.array("The preference values associated with the subscriber.", s.string("One preference value.")),
});

const pagingSchema = s.looseObject("Moosend paging metadata.", {
  PageSize: s.integer("The page size of the results."),
  CurrentPage: s.integer("The current page number."),
  TotalResults: s.integer("The total number of matching results."),
  TotalPageCount: s.integer("The total number of available pages."),
  SortExpression: s.nullable(s.string("The sort expression used by Moosend.")),
  SortIsAscending: s.boolean("Whether Moosend sorted the results in ascending order."),
});

const mailingListSchema = s.looseObject("A Moosend mailing list object.", {
  ID: s.string("The Moosend mailing list identifier."),
  Name: s.string("The mailing list name."),
  ActiveMemberCount: s.integer("The number of active members in the mailing list."),
  BouncedMemberCount: s.integer("The number of bounced members in the mailing list."),
  RemovedMemberCount: s.integer("The number of removed members in the mailing list."),
  UnsubscribedMemberCount: s.integer("The number of unsubscribed members in the mailing list."),
  Status: s.integer("The Moosend numeric mailing list status."),
  CustomFieldsDefinition: s.array(
    "The custom field definitions configured for the mailing list.",
    s.looseObject("A Moosend custom field definition."),
  ),
  CreatedOn: s.string("The Moosend date string when the mailing list was created."),
  UpdatedOn: s.string("The Moosend date string when the mailing list was updated."),
});

const listMailingListsOutputSchema = s.requiredObject("Moosend active mailing lists response.", {
  Code: s.integer("The Moosend response code. A value of 0 indicates success."),
  Error: s.nullable(s.string("The Moosend error message, or null when successful.")),
  Context: s.looseRequiredObject(
    "The Moosend mailing list response context.",
    {
      Paging: pagingSchema,
      MailingLists: s.array("The active mailing lists returned by Moosend.", mailingListSchema),
    },
    { optional: [] },
  ),
});

const listSubscribersOutputSchema = s.requiredObject("Moosend subscriber list response.", {
  Code: s.integer("The Moosend response code. A value of 0 indicates success."),
  Error: s.nullable(s.string("The Moosend error message, or null when successful.")),
  Context: s.looseRequiredObject(
    "The Moosend subscribers response context.",
    {
      Paging: pagingSchema,
      Subscribers: s.array("The subscribers returned by Moosend.", subscriberSchema),
    },
    { optional: [] },
  ),
});

const singleSubscriberOutputSchema = s.requiredObject("Moosend single subscriber response.", {
  Code: s.integer("The Moosend response code. A value of 0 indicates success."),
  Error: s.nullable(s.string("The Moosend error message, or null when successful.")),
  Context: subscriberSchema,
});

export const moosendActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_mailing_lists",
    description: "List active mailing lists in the current Moosend account.",
    inputSchema: s.object(
      "Query parameters for retrieving Moosend active mailing lists.",
      {
        Format: formatSchema,
        WithStatistics: s.boolean("Whether Moosend should include subscriber statistics."),
        SortBy: sortBySchema,
        SortMethod: sortMethodSchema,
      },
      { optional: ["Format", "WithStatistics", "SortBy", "SortMethod"] },
    ),
    outputSchema: listMailingListsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_subscribers",
    description: "List subscribers in a Moosend mailing list filtered by subscriber status.",
    inputSchema: s.object(
      "Path and query parameters for retrieving subscribers in a Moosend mailing list.",
      {
        MailingListID: s.nonEmptyString("The ID of the email list containing the subscribers."),
        Status: subscriberStatusSchema,
        Format: formatSchema,
        Page: s.positiveInteger("The page of subscriber results to return."),
        PageSize: s.positiveInteger("The number of subscriber results to return per page."),
      },
      { optional: ["Format", "Page", "PageSize"] },
    ),
    outputSchema: listSubscribersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_subscriber_by_email",
    description: "Fetch one Moosend subscriber from a mailing list by email address.",
    inputSchema: s.object(
      "Path and query parameters for retrieving one Moosend subscriber by email address.",
      {
        MailingListID: s.nonEmptyString("The ID of the email list that contains the subscriber."),
        Email: s.email("The email address of the subscriber to retrieve."),
        Format: formatSchema,
      },
      { optional: ["Format"] },
    ),
    outputSchema: singleSubscriberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_subscriber",
    description: "Add or update one subscriber in a Moosend mailing list.",
    inputSchema: s.object(
      "Path, query, and JSON body parameters for adding or updating a Moosend subscriber.",
      {
        MailingListID: s.nonEmptyString("The ID of the email list where Moosend should add the subscriber."),
        Email: s.email("The email address of the subscriber."),
        Format: formatSchema,
        Name: s.nonEmptyString("The subscriber name."),
        HasExternalDoubleOptIn: s.boolean("Whether the subscriber has given subscription consent by other means."),
        CustomFields: s.array(
          "Custom field values in Moosend FieldName=Value format.",
          s.nonEmptyString("One custom field value in FieldName=Value format."),
        ),
        Tags: s.array("Tags to assign to the subscriber.", s.nonEmptyString("One subscriber tag.")),
        Preferences: s.array(
          "Preference values to assign to the subscriber.",
          s.nonEmptyString("One preference value."),
        ),
      },
      {
        optional: ["Format", "Name", "HasExternalDoubleOptIn", "CustomFields", "Tags", "Preferences"],
      },
    ),
    outputSchema: singleSubscriberOutputSchema,
  }),
];
