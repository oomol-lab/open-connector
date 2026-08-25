import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mailwizz";

const uid = (description: string) => s.nonEmptyString(description);
const paginationInput = {
  page: s.integer("The page number to retrieve, starting at 1.", { minimum: 1 }),
  perPage: s.integer("The number of records to retrieve per page.", { minimum: 1 }),
};
const responseData = s.looseObject("The data payload returned by the MailWizz instance.");
const responseSchema = (description: string) =>
  s.object(
    description,
    {
      status: s.string("The MailWizz response status."),
      data: responseData,
    },
    { optional: ["data"] },
  );

export const mailWizzActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_lists",
    description: "List mailing lists available to the connected MailWizz customer.",
    requiredScopes: [],
    inputSchema: s.object("The input for listing MailWizz mailing lists.", paginationInput, {
      optional: ["page", "perPage"],
    }),
    outputSchema: responseSchema("The paginated MailWizz mailing-list response."),
  }),
  defineProviderAction(service, {
    name: "get_list",
    description: "Retrieve one MailWizz mailing list by its unique ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving one MailWizz mailing list.", {
      listUid: uid("The unique ID of the MailWizz mailing list."),
    }),
    outputSchema: responseSchema("The MailWizz mailing-list response."),
  }),
  defineProviderAction(service, {
    name: "list_subscribers",
    description: "List subscribers in one MailWizz mailing list.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for listing subscribers in a MailWizz mailing list.",
      { listUid: uid("The unique ID of the MailWizz mailing list."), ...paginationInput },
      { optional: ["page", "perPage"] },
    ),
    outputSchema: responseSchema("The paginated MailWizz subscriber response."),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    description: "Retrieve one subscriber from a MailWizz mailing list by unique ID.",
    requiredScopes: [],
    inputSchema: s.object("The input for retrieving one MailWizz subscriber.", {
      listUid: uid("The unique ID of the MailWizz mailing list."),
      subscriberUid: uid("The unique ID of the MailWizz subscriber."),
    }),
    outputSchema: responseSchema("The MailWizz subscriber response."),
  }),
  defineProviderAction(service, {
    name: "create_or_update_subscriber",
    description:
      "Create a subscriber in a MailWizz list, or update the existing subscriber with the same email address.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for creating or updating a MailWizz subscriber.",
      {
        listUid: uid("The unique ID of the MailWizz mailing list."),
        email: s.email("The subscriber email address."),
        fields: s.record(
          "Additional MailWizz list field values keyed by field tag, such as FNAME or LNAME.",
          s.anyOf("A string, number, or boolean list field value.", [
            s.string("A string list field value."),
            s.number("A numeric list field value."),
            s.boolean("A boolean list field value."),
          ]),
        ),
      },
      { optional: ["fields"] },
    ),
    outputSchema: responseSchema("The created or updated MailWizz subscriber response."),
  }),
  defineProviderAction(service, {
    name: "unsubscribe_subscriber",
    description: "Silently unsubscribe one subscriber from a MailWizz mailing list.",
    requiredScopes: [],
    inputSchema: s.object("The input for unsubscribing one MailWizz subscriber.", {
      listUid: uid("The unique ID of the MailWizz mailing list."),
      subscriberUid: uid("The unique ID of the MailWizz subscriber."),
    }),
    outputSchema: s.object("The MailWizz unsubscribe response.", {
      status: s.string("The MailWizz response status."),
    }),
  }),
];
