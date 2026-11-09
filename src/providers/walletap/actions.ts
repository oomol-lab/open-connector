import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "walletap";
const dataOutputSchema = s.object("A Walletap API response.", {
  data: s.unknown("The JSON payload returned by Walletap."),
});
const passFieldValueSchema = s.anyOf("A pass field value rendered as text.", [
  s.string("A text pass field value."),
  s.number("A numeric pass field value."),
]);
const passFieldsSchema = s.record(
  "Pass field values keyed by the field IDs configured on the template.",
  passFieldValueSchema,
);
const passIdentifierProperties = {
  id: s.string("The Walletap pass ID. Use this or externalId together with templateId."),
  externalId: s.string("The caller-defined pass ID. This must be combined with templateId when id is omitted."),
  templateId: s.string("The template ID. This is required when identifying a pass by externalId."),
};

export const walletapActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_templates",
    operationType: "read",
    description: "List wallet-pass templates owned by the connected Walletap account.",
    inputSchema: s.object(
      "The input for listing Walletap templates.",
      {
        limit: s.integer("The maximum number of templates to return, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
        startingAfter: s.string("The next-page cursor returned by an earlier request."),
      },
      { optional: ["limit", "startingAfter"] },
    ),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_template",
    operationType: "read",
    description: "Get one Walletap template and its configured pass fields.",
    inputSchema: s.object("The input for getting a Walletap template.", {
      templateId: s.string("The Walletap template ID."),
    }),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_passes",
    operationType: "read",
    description: "List issued Walletap passes for a template.",
    inputSchema: s.object(
      "The input for listing Walletap passes.",
      {
        templateId: s.string("The template ID whose passes should be listed."),
        limit: s.positiveInteger("The maximum number of passes to return."),
        startAfter: s.string("The next-page cursor returned by an earlier request."),
        endBefore: s.string("The previous-page cursor returned by an earlier request."),
        status: s.stringEnum("The installation status to include.", ["all", "installed", "not_installed"]),
      },
      { optional: ["limit", "startAfter", "endBefore", "status"] },
    ),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_passes",
    operationType: "read",
    description: "Search passes in one Walletap template by email address or phone number.",
    inputSchema: s.object("The input for searching Walletap passes.", {
      templateId: s.string("The template ID to search within."),
      searchQuery: s.string("The email address or phone number to search for."),
    }),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_pass",
    operationType: "read",
    description: "Get one Walletap pass by pass ID or by external ID and template ID.",
    inputSchema: s.object(
      "The input for getting a Walletap pass.",
      {
        ...passIdentifierProperties,
        includeTemplate: s.boolean("Whether to include the full template in the response."),
        locale: s.string("The locale used to render pass text, such as en or de."),
      },
      { optional: ["id", "externalId", "templateId", "includeTemplate", "locale"] },
    ),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_pass",
    operationType: "write",
    description: "Issue one to ten Walletap passes from existing templates.",
    inputSchema: s.object(
      "The input for issuing Walletap passes.",
      {
        passes: s.array(
          "The passes to issue in this request.",
          s.object(
            "One Walletap pass to issue.",
            {
              templateId: s.string("The template used to issue the pass."),
              id: s.string("A custom pass ID; Walletap generates one when omitted."),
              externalId: s.string("The caller-defined ID for this customer or pass."),
              email: s.string("The pass holder email address."),
              phone: s.string("The pass holder phone number."),
              templateFields: passFieldsSchema,
              customFields: s.record("Custom metadata keyed by caller-defined field names.", passFieldValueSchema),
              memberId: s.string("The membership ID for a membership pass."),
              membershipPlanId: s.string("The Walletap membership plan ID."),
              locationId: s.string("The Walletap location ID associated with the pass."),
              redemptionValue: s.string("The NFC redemption value for the pass."),
              balanceIsAdditive: s.boolean("Whether an initial balance adds to an existing pass balance."),
              collectedStamps: s.nonNegativeInteger("The initial stamp count."),
            },
            {
              optional: [
                "id",
                "externalId",
                "email",
                "phone",
                "templateFields",
                "customFields",
                "memberId",
                "membershipPlanId",
                "locationId",
                "redemptionValue",
                "balanceIsAdditive",
                "collectedStamps",
              ],
            },
          ),
          { minItems: 1, maxItems: 10 },
        ),
        sendToEmail: s.boolean("Whether Walletap should email pass links to the holders."),
        sendToPhone: s.boolean("Whether Walletap should text pass links to the holders."),
        locale: s.string("The locale for pass text and delivery messages."),
      },
      { optional: ["sendToEmail", "sendToPhone", "locale"] },
    ),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_pass",
    operationType: "destructive",
    description: "Update a Walletap pass, including its displayed fields, stamps, balance, or validity.",
    inputSchema: s.object(
      "The input for updating a Walletap pass.",
      {
        ...passIdentifierProperties,
        templateFields: passFieldsSchema,
        customFields: s.record("Custom metadata updates keyed by caller-defined field names.", passFieldValueSchema),
        isValid: s.boolean("Whether the pass remains valid; false voids the pass."),
        redemptionValue: s.string("The updated NFC redemption value."),
        stampOperation: s.object(
          "A stamp-count update.",
          {
            operation: s.stringEnum("The stamp operation.", ["add", "set", "remove", "removeAll"]),
            count: s.nonNegativeInteger("The number of stamps to add, set, or remove."),
            isTotal: s.boolean("Whether count is the absolute total across all cards."),
          },
          { optional: ["count", "isTotal"] },
        ),
        balanceOperation: s.object(
          "A stored-balance update.",
          {
            operation: s.stringEnum("The balance operation.", ["add", "subtract", "set"]),
            amount: s.number("The amount to add, subtract, or set."),
            isTotal: s.boolean("Whether amount is the absolute total."),
          },
          { optional: ["isTotal"] },
        ),
      },
      {
        optional: [
          "id",
          "externalId",
          "templateId",
          "templateFields",
          "customFields",
          "isValid",
          "redemptionValue",
          "stampOperation",
          "balanceOperation",
        ],
      },
    ),
    outputSchema: dataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "notify_pass",
    operationType: "write",
    description: "Send a push notification to one Walletap pass holder.",
    inputSchema: s.object(
      "The input for notifying a Walletap pass holder.",
      {
        passId: s.string("The Walletap pass ID."),
        title: s.string("The notification title."),
        content: s.string("The notification body; URLs become clickable links."),
        validFrom: s.dateTime("When the notification becomes visible."),
        validUntil: s.dateTime("When the notification expires."),
      },
      { optional: ["validFrom", "validUntil"] },
    ),
    outputSchema: dataOutputSchema,
  }),
];
