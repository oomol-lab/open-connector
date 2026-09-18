import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bot_star";

function trimmedString(description: string, options: { maxLength?: number } = {}): JsonSchema {
  return s.string({ description, minLength: 1, maxLength: options.maxLength });
}

const botIdSchema = trimmedString("The BotStar bot ID.");
const attributeIdSchema = trimmedString("The BotStar bot attribute ID.");
const userIdSchema = trimmedString("The BotStar audience user ID.");
const entityIdSchema = trimmedString("The BotStar CMS entity ID.");
const entityItemIdSchema = trimmedString("The BotStar CMS entity item ID.");
const envSchema = s.stringEnum("The BotStar environment to read or mutate.", ["draft", "live"]);
const envMutationSchema = s.stringEnum("The BotStar environment target for mutation endpoints.", [
  "draft",
  "draft,live",
]);
const statusSchema = s.stringEnum("The BotStar CMS entity item status.", ["enabled", "disabled"]);
const rawObjectSchema = s.looseObject("The raw BotStar object returned by the Public API.");
const successSchema = s.object(
  "A BotStar success response.",
  {
    success: s.boolean("Whether BotStar accepted the request."),
    status: s.string("The status string returned by BotStar."),
  },
  { required: ["success", "status"] },
);

const emptyInputSchema = s.object("The empty input payload for this BotStar action.", {});

const botSchema = s.looseRequiredObject(
  "A BotStar bot.",
  {
    id: s.string("The BotStar bot ID."),
    name: s.string("The bot name."),
    team_name: s.string("The BotStar team name associated with the bot."),
  },
  { optional: ["name", "team_name"] },
);

const botOutputSchema = s.object("A BotStar bot result.", { bot: botSchema }, { required: ["bot"] });
const botIdInputSchema = s.object(
  "Input identifying one BotStar bot.",
  { botId: botIdSchema },
  { required: ["botId"] },
);

const botAttributeSchema = s.looseRequiredObject(
  "A BotStar bot attribute.",
  {
    id: s.string("The BotStar bot attribute ID."),
    name: s.string("The bot attribute name."),
    data_type: s.stringEnum("The BotStar bot attribute data type.", ["string", "number", "date"]),
    desc: s.string("The bot attribute description when returned."),
    value: s.anyOf("The default bot attribute value.", [
      s.string("A string or date attribute value."),
      s.number("A numeric attribute value."),
    ]),
  },
  { optional: ["desc", "value"] },
);

const listBotAttributesInputSchema = s.object(
  "Input for listing BotStar bot attributes.",
  {
    botId: botIdSchema,
    env: envSchema,
  },
  { required: ["botId"] },
);

const listBotAttributesOutputSchema = s.object(
  "BotStar bot attributes result.",
  {
    attributes: s.array("The bot attributes returned by BotStar.", botAttributeSchema),
  },
  { required: ["attributes"] },
);

const attributeValueSchema = s.anyOf("A BotStar bot attribute value.", [
  s.string("A string or date attribute value."),
  s.number("A numeric attribute value."),
]);

const createBotAttributeInputSchema = s.object(
  "Input for creating a BotStar bot attribute.",
  {
    botId: botIdSchema,
    env: envMutationSchema,
    name: trimmedString("The bot attribute name.", { maxLength: 250 }),
    data_type: s.stringEnum("The bot attribute data type.", ["string", "number", "date"]),
    desc: s.string("The bot attribute description."),
    value: attributeValueSchema,
    localizedValues: s.record(
      "Language-specific attribute values keyed by BotStar field name such as value_es.",
      attributeValueSchema,
    ),
  },
  { required: ["botId", "name", "data_type"] },
);

const updateBotAttributeInputSchema = {
  ...s.object(
    "Input for updating a BotStar bot attribute.",
    {
      botId: botIdSchema,
      attributeId: attributeIdSchema,
      env: envMutationSchema,
      desc: s.string("The updated bot attribute description."),
      value: attributeValueSchema,
      localizedValues: s.record(
        "Language-specific attribute values keyed by BotStar field name such as value_es.",
        attributeValueSchema,
      ),
    },
    { required: ["botId", "attributeId"] },
  ),
  anyOf: [{ required: ["desc"] }, { required: ["value"] }, { required: ["localizedValues"] }],
};

const deleteBotAttributeInputSchema = s.object(
  "Input for deleting a BotStar bot attribute.",
  {
    botId: botIdSchema,
    attributeId: attributeIdSchema,
    env: envMutationSchema,
  },
  { required: ["botId", "attributeId"] },
);

const userInputSchema = s.object(
  "Input identifying a BotStar audience user.",
  {
    botId: botIdSchema,
    userId: userIdSchema,
  },
  { required: ["botId", "userId"] },
);

const userSchema = s.looseRequiredObject(
  "A BotStar audience user.",
  {
    id: s.string("The BotStar user ID."),
    board_id: s.string("The BotStar board ID associated with the user."),
    name: s.string("The user's full name when available."),
    first_name: s.string("The user's first name when available."),
    last_name: s.string("The user's last name when available."),
    email: s.string("The user's email address when available."),
    channel: s.string("The channel through which the user interacted."),
    locale: s.string("The user's locale when available."),
  },
  { optional: ["id", "board_id", "name", "first_name", "last_name", "email", "channel", "locale"] },
);

const userOutputSchema = s.object("A BotStar user result.", { user: userSchema }, { required: ["user"] });

const userAttributeValueSchema = s.anyOf("A BotStar user attribute value.", [
  s.string("A string, date, or empty string user attribute value."),
  s.number("A numeric user attribute value."),
  s.boolean("A boolean user attribute value."),
]);

const updateUserAttributesInputSchema = {
  ...s.object(
    "Input for updating BotStar user attributes.",
    {
      botId: botIdSchema,
      userId: userIdSchema,
      attributes: s.record("User attributes to update by BotStar field name.", userAttributeValueSchema),
    },
    { required: ["botId", "userId", "attributes"] },
  ),
  properties: {
    botId: botIdSchema,
    userId: userIdSchema,
    attributes: {
      ...s.record("User attributes to update by BotStar field name.", userAttributeValueSchema),
      minProperties: 1,
    },
  },
};

const createUserAttributeInputSchema = s.object(
  "Input for creating a custom BotStar user field.",
  {
    botId: botIdSchema,
    field_name: trimmedString("The custom user attribute field name."),
    field_type: s.stringEnum("The custom user attribute type.", ["string", "number", "date", "boolean"]),
  },
  { required: ["botId", "field_name", "field_type"] },
);

const userAttributeSchema = s.looseRequiredObject("A BotStar custom user attribute.", {
  id: s.string("The BotStar custom user attribute ID."),
  field_name: s.string("The custom user attribute field name."),
  field_type: s.stringEnum("The custom user attribute type.", ["string", "number", "date", "boolean"]),
});

const userAttributeOutputSchema = s.object(
  "A BotStar custom user attribute result.",
  {
    attribute: userAttributeSchema,
  },
  { required: ["attribute"] },
);

const entityFieldSchema = s.looseRequiredObject(
  "A BotStar CMS entity field.",
  {
    unique_name: s.string("The unique BotStar field name."),
    name: s.string("The CMS field display name."),
    data_type: s.string("The BotStar CMS field data type."),
    options: s.looseObject("Field options returned by BotStar when available."),
  },
  { optional: ["unique_name", "name", "data_type", "options"] },
);

const entityFieldInputSchema = s.object(
  "A field definition to create with a BotStar CMS entity.",
  {
    unique_name: trimmedString("The unique BotStar field name."),
    name: trimmedString("The CMS field display name."),
    data_type: trimmedString("The BotStar CMS field data type."),
    options: s.looseObject("Field options such as predefined_data or entity_id."),
  },
  { required: ["unique_name", "name", "data_type"] },
);

const entitySchema = s.looseRequiredObject(
  "A BotStar CMS entity.",
  {
    id: s.string("The BotStar CMS entity ID."),
    name: s.string("The CMS entity name."),
    fields: s.array("The CMS entity fields returned by BotStar.", entityFieldSchema),
  },
  { optional: ["fields"] },
);

const listCmsEntitiesInputSchema = s.object(
  "Input for listing BotStar CMS entities.",
  {
    botId: botIdSchema,
    env: envSchema,
  },
  { required: ["botId"] },
);

const cmsEntityInputSchema = s.object(
  "Input identifying one BotStar CMS entity.",
  {
    botId: botIdSchema,
    entityId: entityIdSchema,
    env: envSchema,
  },
  { required: ["botId", "entityId"] },
);

const createCmsEntityInputSchema = s.object(
  "Input for creating a BotStar CMS entity.",
  {
    botId: botIdSchema,
    env: envMutationSchema,
    name: trimmedString("The CMS entity name."),
    fields: s.array("Fields to create with the CMS entity.", entityFieldInputSchema, { minItems: 1 }),
  },
  { required: ["botId", "name"] },
);

const updateCmsEntityInputSchema = s.object(
  "Input for updating a BotStar CMS entity.",
  {
    botId: botIdSchema,
    entityId: entityIdSchema,
    env: envMutationSchema,
    name: trimmedString("The updated CMS entity name."),
  },
  { required: ["botId", "entityId", "name"] },
);

const deleteCmsEntityInputSchema = s.object(
  "Input for deleting a BotStar CMS entity.",
  {
    botId: botIdSchema,
    entityId: entityIdSchema,
    env: envMutationSchema,
  },
  { required: ["botId", "entityId"] },
);

const entityOutputSchema = s.object("A BotStar CMS entity result.", { entity: entitySchema }, { required: ["entity"] });
const listEntitiesOutputSchema = s.object(
  "BotStar CMS entities result.",
  {
    entities: s.array("The CMS entities returned by BotStar.", entitySchema),
  },
  { required: ["entities"] },
);

const entityItemSchema = s.looseRequiredObject(
  "A BotStar CMS entity item.",
  {
    id: s.string("The BotStar CMS entity item ID."),
    name: s.string("The CMS entity item name."),
    status: statusSchema,
    entity_id: s.string("The BotStar CMS entity ID associated with the item."),
  },
  { optional: ["status", "entity_id"] },
);

const listCmsEntityItemsInputSchema = s.object(
  "Input for listing BotStar CMS entity items.",
  {
    botId: botIdSchema,
    entityId: entityIdSchema,
    env: envSchema,
    page: s.positiveInteger("The 1-based page number to request."),
    limit: s.positiveInteger("The maximum number of items to return."),
    name: trimmedString("Filter CMS entity items by name."),
    status: statusSchema,
  },
  { required: ["botId", "entityId"] },
);

const getCmsEntityItemInputSchema = s.object(
  "Input for retrieving one BotStar CMS entity item.",
  {
    botId: botIdSchema,
    entityId: entityIdSchema,
    entityItemId: entityItemIdSchema,
    env: envSchema,
  },
  { required: ["botId", "entityId", "entityItemId"] },
);

const entityItemDataSchema = s.record(
  "Dynamic CMS item field values keyed by BotStar field unique name, excluding name and status.",
  s.nullable(
    s.anyOf("A CMS item field value.", [
      s.string("A string field value."),
      s.number("A numeric field value."),
      s.boolean("A boolean field value."),
      s.array("A multi-value field value.", s.string("One selected value.")),
    ]),
  ),
);

const createCmsEntityItemInputSchema = s.object(
  "Input for creating a BotStar CMS entity item.",
  {
    botId: botIdSchema,
    entityId: entityIdSchema,
    env: envMutationSchema,
    name: trimmedString("The CMS entity item name."),
    status: statusSchema,
    data: entityItemDataSchema,
  },
  { required: ["botId", "entityId", "name"] },
);

const updateCmsEntityItemInputSchema = {
  ...s.object(
    "Input for updating a BotStar CMS entity item.",
    {
      botId: botIdSchema,
      entityId: entityIdSchema,
      entityItemId: entityItemIdSchema,
      env: envMutationSchema,
      name: trimmedString("The updated CMS entity item name."),
      status: statusSchema,
      data: entityItemDataSchema,
    },
    { required: ["botId", "entityId", "entityItemId"] },
  ),
  anyOf: [{ required: ["name"] }, { required: ["status"] }, { required: ["data"] }],
};

const deleteCmsEntityItemInputSchema = s.object(
  "Input for deleting a BotStar CMS entity item.",
  {
    botId: botIdSchema,
    entityId: entityIdSchema,
    entityItemId: entityItemIdSchema,
    env: envMutationSchema,
  },
  { required: ["botId", "entityId", "entityItemId"] },
);

const itemOutputSchema = s.object(
  "A BotStar CMS entity item result.",
  { item: entityItemSchema },
  { required: ["item"] },
);
const listItemsOutputSchema = s.object(
  "BotStar CMS entity items result.",
  {
    items: s.array("The CMS entity items returned by BotStar.", entityItemSchema),
  },
  { required: ["items"] },
);

export const botStarActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_bots",
    operationType: "read",
    description: "List bots available to the configured BotStar API token.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object(
      "BotStar bot list result.",
      {
        bots: s.array("The bots returned by BotStar.", botSchema),
      },
      { required: ["bots"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_bot",
    operationType: "write",
    description: "Create a new BotStar bot.",
    inputSchema: s.object(
      "Input for creating a BotStar bot.",
      {
        name: trimmedString("The new bot name.", { maxLength: 250 }),
      },
      { required: ["name"] },
    ),
    outputSchema: botOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bot",
    operationType: "read",
    description: "Get one BotStar bot by ID.",
    inputSchema: botIdInputSchema,
    outputSchema: botOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_bot_attributes",
    operationType: "read",
    description: "List attributes configured for a BotStar bot.",
    inputSchema: listBotAttributesInputSchema,
    outputSchema: listBotAttributesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_bot_attribute",
    operationType: "write",
    description: "Create an attribute on a BotStar bot.",
    inputSchema: createBotAttributeInputSchema,
    outputSchema: s.object(
      "A BotStar bot attribute result.",
      { attribute: botAttributeSchema },
      { required: ["attribute"] },
    ),
  }),
  defineProviderAction(service, {
    name: "update_bot_attribute",
    operationType: "write",
    description: "Update an existing BotStar bot attribute.",
    inputSchema: updateBotAttributeInputSchema,
    outputSchema: s.object(
      "A BotStar bot attribute update result.",
      { attribute: rawObjectSchema },
      { required: ["attribute"] },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_bot_attribute",
    operationType: "destructive",
    description: "Delete a BotStar bot attribute.",
    inputSchema: deleteBotAttributeInputSchema,
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "publish_bot",
    operationType: "write",
    description: "Publish BotStar bot changes to the live environment.",
    inputSchema: botIdInputSchema,
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    operationType: "read",
    description: "Get a BotStar audience user by bot ID and user ID.",
    inputSchema: userInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_user_attributes",
    operationType: "write",
    description: "Update attributes on a BotStar audience user.",
    inputSchema: updateUserAttributesInputSchema,
    outputSchema: s.object(
      "Updated BotStar user attributes.",
      {
        attributes: s.record("The attributes returned by BotStar.", userAttributeValueSchema),
      },
      { required: ["attributes"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_user_attribute",
    operationType: "write",
    description: "Create a custom user attribute field for a BotStar bot.",
    inputSchema: createUserAttributeInputSchema,
    outputSchema: userAttributeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_cms_entities",
    operationType: "read",
    description: "List CMS entities configured for a BotStar bot.",
    inputSchema: listCmsEntitiesInputSchema,
    outputSchema: listEntitiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_cms_entity",
    operationType: "write",
    description: "Create a BotStar CMS entity.",
    inputSchema: createCmsEntityInputSchema,
    outputSchema: entityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_cms_entity",
    operationType: "read",
    description: "Get one BotStar CMS entity by ID.",
    inputSchema: cmsEntityInputSchema,
    outputSchema: entityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_cms_entity",
    operationType: "write",
    description: "Update a BotStar CMS entity.",
    inputSchema: updateCmsEntityInputSchema,
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_cms_entity",
    operationType: "destructive",
    description: "Delete a BotStar CMS entity.",
    inputSchema: deleteCmsEntityInputSchema,
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "list_cms_entity_items",
    operationType: "read",
    description: "List items in a BotStar CMS entity.",
    inputSchema: listCmsEntityItemsInputSchema,
    outputSchema: listItemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_cms_entity_item",
    operationType: "write",
    description: "Create an item in a BotStar CMS entity.",
    inputSchema: createCmsEntityItemInputSchema,
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_cms_entity_item",
    operationType: "read",
    description: "Get one item from a BotStar CMS entity.",
    inputSchema: getCmsEntityItemInputSchema,
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_cms_entity_item",
    operationType: "write",
    description: "Update an item in a BotStar CMS entity.",
    inputSchema: updateCmsEntityItemInputSchema,
    outputSchema: successSchema,
  }),
  defineProviderAction(service, {
    name: "delete_cms_entity_item",
    operationType: "destructive",
    description: "Delete an item from a BotStar CMS entity.",
    inputSchema: deleteCmsEntityItemInputSchema,
    outputSchema: successSchema,
  }),
];
