import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "unthread";

const accountFieldsSchema = {
  name: s.nonEmptyString("The account name."),
  primarySupportAssigneeId: s.nullable(s.nonEmptyString("The ID of the primary support user or team.")),
  primarySupportAssigneeType: s.nullable(s.stringEnum("The type of the primary support assignee.", ["user", "team"])),
  secondarySupportAssigneeId: s.nullable(s.nonEmptyString("The ID of the secondary support user or team.")),
  secondarySupportAssigneeType: s.nullable(
    s.stringEnum("The type of the secondary support assignee.", ["user", "team"]),
  ),
  emailsAndDomains: s.array(
    "Email addresses and domains associated with the account.",
    s.nonEmptyString("An email address or domain associated with the account."),
  ),
  slackChannelIds: s.array("Slack channel IDs associated with the account.", s.nonEmptyString("A Slack channel ID.")),
  slackTeamIds: s.array("Slack workspace IDs associated with the account.", s.nonEmptyString("A Slack workspace ID.")),
  customFields: s.array(
    "Custom field values associated with the account.",
    s.looseObject("A custom field value accepted by Unthread."),
  ),
  supportSteps: s.array(
    "Support steps configured for the account.",
    s.looseObject("A support step accepted by Unthread."),
  ),
  imageUrl: s.nullable(s.url("The account image URL.")),
  externalCrmMetadata: s.nullable(
    s.object("The external CRM record linked to the account.", {
      id: s.nonEmptyString("The external CRM record ID."),
    }),
  ),
};

const optionalAccountFields = [
  "primarySupportAssigneeId",
  "primarySupportAssigneeType",
  "secondarySupportAssigneeId",
  "secondarySupportAssigneeType",
  "emailsAndDomains",
  "slackChannelIds",
  "slackTeamIds",
  "customFields",
  "supportSteps",
  "imageUrl",
  "externalCrmMetadata",
];

const accountSchema = s.looseObject("An Unthread account record.", {
  id: s.nonEmptyString("The Unthread account ID."),
  name: s.nonEmptyString("The account name."),
});

const projectedAccountSchema = s.looseObject(
  "An Unthread account projection containing the fields selected by the caller.",
);

const accountIdInputSchema = s.object("The Unthread account to operate on.", {
  accountId: s.nonEmptyString("The Unthread account ID."),
});

const accountOutputSchema = s.object("The account returned by Unthread.", {
  account: accountSchema,
});

const listFilterSchema = s.object("A filter applied to the account list.", {
  field: s.nonEmptyString("The documented account field to filter by."),
  operator: s.stringEnum("The comparison operator for the filter.", [
    "==",
    "!=",
    ">",
    "<",
    "in",
    "notIn",
    "contains",
    "notContains",
    "like",
  ]),
  value: s.anyOf("The string, number, or string list compared by the filter.", [
    s.string("A string filter value."),
    s.number("A numeric filter value."),
    s.array("A list of string filter values.", s.string("A string filter value.")),
  ]),
});

const cursorSchema = s.object(
  "Cursor information returned by an Unthread list endpoint.",
  {
    hasNext: s.boolean("Whether another result page is available."),
    hasPrevious: s.boolean("Whether a previous result page is available."),
    next: s.string("The cursor for the next result page."),
    previous: s.string("The cursor for the previous result page."),
  },
  { optional: ["next", "previous"] },
);

export const unthreadActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_account",
    description: "Create an external customer account in Unthread.",
    requiredScopes: [],
    inputSchema: s.object("The new Unthread account fields.", accountFieldsSchema, {
      optional: optionalAccountFields,
    }),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve an Unthread account by ID.",
    requiredScopes: [],
    inputSchema: accountIdInputSchema,
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List and filter external customer accounts in Unthread.",
    requiredScopes: [],
    inputSchema: s.object(
      "The account list selection, filtering, ordering, and pagination options.",
      {
        select: s.array(
          "Documented account fields to include in each result.",
          s.nonEmptyString("A documented account field name."),
          { minItems: 1 },
        ),
        order: s.array(
          "Documented account fields used to order results.",
          s.nonEmptyString("A documented account field name."),
          { minItems: 1 },
        ),
        where: s.array("Filters applied to the account list.", listFilterSchema, {
          minItems: 1,
        }),
        limit: s.integer("The maximum number of accounts to return, up to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        descending: s.boolean("Whether to sort the selected order fields in descending order."),
        cursor: s.nonEmptyString("The opaque cursor for the next or previous result page."),
      },
      { optional: ["select", "order", "where", "limit", "descending", "cursor"] },
    ),
    outputSchema: s.object("A page of Unthread accounts.", {
      accounts: s.array("The account projections returned for this page.", projectedAccountSchema),
      totalCount: s.integer("The total number of accounts matching the request."),
      cursors: cursorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_account",
    description: "Update an external customer account in Unthread.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The Unthread account ID and fields to update.",
        { accountId: s.nonEmptyString("The Unthread account ID."), ...accountFieldsSchema },
        { optional: ["name", ...optionalAccountFields] },
      ),
      ["name", ...optionalAccountFields],
    ),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_account",
    description: "Permanently delete an external customer account from Unthread.",
    requiredScopes: [],
    inputSchema: accountIdInputSchema,
    outputSchema: s.object("Confirmation that the Unthread account was deleted.", {
      deleted: s.boolean("Whether the account deletion succeeded."),
      accountId: s.nonEmptyString("The deleted Unthread account ID."),
    }),
  }),
];
