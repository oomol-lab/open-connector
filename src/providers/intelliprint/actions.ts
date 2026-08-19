import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "intelliprint";

const idSchema = (description: string) => s.string(description, { minLength: 1 });

const limitSchema = s.integer(
  "The maximum number of Intelliprint objects to return. The official API supports 1 through 1000.",
  { minimum: 1, maximum: 1000 },
);
const skipSchema = s.integer("The number of Intelliprint objects to skip before returning results.", {
  minimum: 0,
});
const sortOrderSchema = s.stringEnum("The sort direction for the Intelliprint list request.", ["asc", "desc"]);
const fieldsSchema = s.array(
  "The optional Intelliprint response fields to request.",
  s.string("One Intelliprint response field name to include.", { minLength: 1 }),
  { minItems: 1 },
);

const printSortFieldSchema = s.stringEnum("The Intelliprint print field used to sort the list response.", [
  "created",
  "confirmed_at",
  "reference",
  "type",
  "letters",
  "pages",
  "sheets",
  "letters.returned.date",
  "cost.after_tax",
  "cost.amount",
]);
const backgroundSortFieldSchema = s.stringEnum("The Intelliprint background field used to sort the list response.", [
  "created",
  "name",
]);
const recipientSortFieldSchema = s.stringEnum(
  "The Intelliprint mailing list recipient field used to sort the list response.",
  ["created", "name"],
);
const mailingListSortFieldSchema = s.stringEnum("The Intelliprint mailing list field used to sort the list response.", [
  "created",
  "name",
  "recipients",
]);
const printTypeSchema = s.stringEnum("The Intelliprint print job type to filter by.", ["letter", "postcard"]);

const listBaseProperties = {
  limit: limitSchema,
  skip: skipSchema,
  sortOrder: sortOrderSchema,
  fields: fieldsSchema,
};

const listInputOptionalBase = ["limit", "skip", "sortOrder", "fields"];

const intelliprintResourceSchema = (description: string) =>
  s.looseObject(description, {
    id: s.string("The Intelliprint object ID."),
    object: s.string("The Intelliprint object type."),
    created: s.integer("The UNIX timestamp when the Intelliprint object was created."),
  });

const printSchema = intelliprintResourceSchema("An Intelliprint print job object.");
const backgroundSchema = intelliprintResourceSchema("An Intelliprint background object.");
const mailingListSchema = intelliprintResourceSchema("An Intelliprint mailing list object.");
const recipientSchema = intelliprintResourceSchema("An Intelliprint mailing list recipient object.");

const listOutputSchema = (description: string, itemDescription: string) =>
  s.object(description, {
    data: s.array("The Intelliprint objects returned for this page.", s.looseObject(itemDescription)),
    totalAvailable: s.integer("The total number of Intelliprint objects available across paginated requests."),
    hasMore: s.boolean("Whether another Intelliprint page is available after this response."),
    raw: s.looseObject("The raw Intelliprint list response payload."),
  });

export const intelliprintActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_prints",
    description: "List Intelliprint print jobs with official pagination, sorting, and print-specific filters.",
    inputSchema: s.object(
      "Input parameters for listing Intelliprint print jobs.",
      {
        ...listBaseProperties,
        sortField: printSortFieldSchema,
        testmode: s.boolean("Whether to return only test mode print jobs."),
        confirmed: s.boolean("Whether to filter print jobs by confirmation state."),
        type: printTypeSchema,
        reference: s.string("A print job reference filter.", { minLength: 1 }),
        letterStatus: s.string("The letter status filter sent as letters.status.", { minLength: 1 }),
        returnedAcknowledged: s.boolean("Whether to filter returned letters by the acknowledged flag."),
      },
      {
        optional: [
          ...listInputOptionalBase,
          "sortField",
          "testmode",
          "confirmed",
          "type",
          "reference",
          "letterStatus",
          "returnedAcknowledged",
        ],
      },
    ),
    outputSchema: listOutputSchema(
      "The normalized Intelliprint print job list response.",
      "An Intelliprint print job object returned in the list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_print",
    description: "Retrieve a single Intelliprint print job by ID.",
    inputSchema: s.object("Input parameters for retrieving an Intelliprint print job.", {
      id: idSchema("The Intelliprint print job ID to retrieve."),
    }),
    outputSchema: s.object("The normalized Intelliprint print job response.", {
      print: printSchema,
      raw: s.looseObject("The raw Intelliprint print job response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_backgrounds",
    description:
      "List Intelliprint reusable backgrounds with official pagination, sorting, field selection, and team filtering.",
    inputSchema: s.object(
      "Input parameters for listing Intelliprint backgrounds.",
      {
        ...listBaseProperties,
        sortField: backgroundSortFieldSchema,
        team: s.string("The Intelliprint team ID used to filter reusable backgrounds.", { minLength: 1 }),
      },
      { optional: [...listInputOptionalBase, "sortField", "team"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Intelliprint background list response.",
      "An Intelliprint background object returned in the list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_background",
    description: "Retrieve a single Intelliprint reusable background by ID.",
    inputSchema: s.object("Input parameters for retrieving an Intelliprint background.", {
      id: idSchema("The Intelliprint background ID to retrieve."),
    }),
    outputSchema: s.object("The normalized Intelliprint background response.", {
      background: backgroundSchema,
      raw: s.looseObject("The raw Intelliprint background response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_mailing_lists",
    description: "List Intelliprint mailing lists with official pagination and sorting options.",
    inputSchema: s.object(
      "Input parameters for listing Intelliprint mailing lists.",
      {
        ...listBaseProperties,
        sortField: mailingListSortFieldSchema,
      },
      { optional: [...listInputOptionalBase, "sortField"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Intelliprint mailing list response.",
      "An Intelliprint mailing list object returned in the list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_mailing_list",
    description: "Retrieve a single Intelliprint mailing list by ID.",
    inputSchema: s.object("Input parameters for retrieving an Intelliprint mailing list.", {
      id: idSchema("The Intelliprint mailing list ID to retrieve."),
    }),
    outputSchema: s.object("The normalized Intelliprint mailing list response.", {
      mailingList: mailingListSchema,
      raw: s.looseObject("The raw Intelliprint mailing list response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_mailing_list_recipients",
    description:
      "List recipients for one Intelliprint mailing list with official pagination, sorting, and field selection.",
    inputSchema: s.object(
      "Input parameters for listing recipients in an Intelliprint mailing list.",
      {
        mailingListId: idSchema("The Intelliprint mailing list ID whose recipients are listed."),
        ...listBaseProperties,
        sortField: recipientSortFieldSchema,
      },
      { optional: [...listInputOptionalBase, "sortField"] },
    ),
    outputSchema: listOutputSchema(
      "The normalized Intelliprint mailing list recipient response.",
      "An Intelliprint mailing list recipient object returned in the list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_mailing_list_recipient",
    description: "Retrieve one recipient from an Intelliprint mailing list.",
    inputSchema: s.object("Input parameters for retrieving an Intelliprint mailing list recipient.", {
      mailingListId: idSchema("The Intelliprint mailing list ID containing the recipient."),
      id: idSchema("The Intelliprint mailing list recipient ID to retrieve."),
    }),
    outputSchema: s.object("The normalized Intelliprint mailing list recipient response.", {
      recipient: recipientSchema,
      raw: s.looseObject("The raw Intelliprint mailing list recipient response payload."),
    }),
  }),
];
