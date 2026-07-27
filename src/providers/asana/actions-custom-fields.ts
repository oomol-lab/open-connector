import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  asanaCustomFieldFormats,
  asanaCustomFieldInputRestrictions,
  asanaCustomFieldSubtypes,
  asanaCustomLabelPositions,
  asanaEnumOptionColors,
} from "./custom-field-metadata.ts";
import {
  customFieldSchema,
  customFieldSettingSchema,
  enumOptionSchema,
  gidField,
  includeFieldsSchema,
  nextCursorSchema,
  paginationFields,
  successOutputSchema,
} from "./schemas.ts";

const service = "asana";

const enumOptionBaseWriteFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The enum option name."),
  color: s.stringEnum("The official Asana enum option color.", asanaEnumOptionColors),
};
const enumOptionCreateFields: Record<string, JsonSchema> = {
  ...enumOptionBaseWriteFields,
  enabled: s.literal(true, {
    description: "New Asana enum options are always enabled. Use true or omit this field.",
  }),
};
const enumOptionUpdateFields: Record<string, JsonSchema> = {
  ...enumOptionBaseWriteFields,
  enabled: s.boolean("Whether the enum option is selectable."),
};

const enumOptionCreateSchema = s.object("An enum option to create with the custom field.", enumOptionCreateFields, {
  required: ["name"],
});

const customFieldMutationFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The custom field name."),
  description: s.string("The custom field description."),
  precision: s.integer("Decimal precision for a number field.", { minimum: 0, maximum: 6 }),
  format: s.stringEnum("The display format for a number field.", asanaCustomFieldFormats),
  currencyCode: s.nullable(s.nonEmptyString("ISO 4217 currency code for a currency field, or null to clear it.")),
  customLabel: s.nullable(s.string("The label displayed beside a custom-formatted number, or null to clear it.")),
  customLabelPosition: s.nullable(
    s.stringEnum("The placement of a custom number label, or null to clear it.", asanaCustomLabelPositions),
  ),
  hasNotificationsEnabled: s.boolean("Whether changes to this field notify task followers."),
  inputRestrictions: s.array(
    "Resource types accepted by a reference custom field.",
    s.stringEnum("A permitted Asana resource type.", asanaCustomFieldInputRestrictions),
    { minItems: 1 },
  ),
};

const numberOnlyFieldNames = ["precision", "format", "currencyCode", "customLabel", "customLabelPosition"];
const nonEnumSubtypeExclusions = {
  not: { anyOf: [{ required: ["enumOptions"] }, ...numberOnlyFieldNames.map((field) => ({ required: [field] }))] },
};
const numberFormatDependencies = [
  {
    if: {
      required: ["currencyCode"],
      properties: { currencyCode: { not: { type: "null" } } },
    },
    then: { required: ["format"], properties: { format: { const: "currency" } } },
  },
  {
    if: {
      anyOf: [
        {
          required: ["customLabel"],
          properties: { customLabel: { not: { type: "null" } } },
        },
        {
          required: ["customLabelPosition"],
          properties: { customLabelPosition: { not: { type: "null" } } },
        },
      ],
    },
    then: { required: ["format"], properties: { format: { const: "custom" } } },
  },
];
const updateNumberFormatDependencies = [
  {
    if: {
      required: ["format", "currencyCode"],
      properties: { currencyCode: { not: { type: "null" } } },
    },
    then: { properties: { format: { const: "currency" } } },
  },
  {
    if: {
      anyOf: [
        {
          required: ["format", "customLabel"],
          properties: { customLabel: { not: { type: "null" } } },
        },
        {
          required: ["format", "customLabelPosition"],
          properties: { customLabelPosition: { not: { type: "null" } } },
        },
      ],
    },
    then: { properties: { format: { const: "custom" } } },
  },
];

const createCustomFieldInputSchema = s.object(
  "The input payload for this action.",
  {
    workspaceId: gidField("The workspace gid in which to create the custom field."),
    resourceSubtype: s.stringEnum("The custom field subtype.", asanaCustomFieldSubtypes),
    ...customFieldMutationFields,
    enumOptions: s.array("Enum or multi-enum options created with the field.", enumOptionCreateSchema, {
      minItems: 1,
      maxItems: 500,
    }),
    ownedByApp: s.boolean("Whether this allow-listed app owns the custom field."),
    includeFields: includeFieldsSchema,
  },
  { required: ["workspaceId", "resourceSubtype", "name"] },
);
createCustomFieldInputSchema.oneOf = [
  {
    properties: { resourceSubtype: { const: "text" } },
    ...nonEnumSubtypeExclusions,
    allOf: [{ not: { required: ["inputRestrictions"] } }],
  },
  {
    properties: { resourceSubtype: { const: "enum" } },
    required: ["enumOptions"],
    not: {
      anyOf: [{ required: ["inputRestrictions"] }, ...numberOnlyFieldNames.map((field) => ({ required: [field] }))],
    },
  },
  {
    properties: { resourceSubtype: { const: "multi_enum" } },
    required: ["enumOptions"],
    not: {
      anyOf: [{ required: ["inputRestrictions"] }, ...numberOnlyFieldNames.map((field) => ({ required: [field] }))],
    },
  },
  {
    properties: { resourceSubtype: { const: "number" } },
    not: { anyOf: [{ required: ["enumOptions"] }, { required: ["inputRestrictions"] }] },
    allOf: numberFormatDependencies,
  },
  {
    properties: { resourceSubtype: { const: "date" } },
    ...nonEnumSubtypeExclusions,
    allOf: [{ not: { required: ["inputRestrictions"] } }],
  },
  {
    properties: { resourceSubtype: { const: "people" } },
    ...nonEnumSubtypeExclusions,
    allOf: [{ not: { required: ["inputRestrictions"] } }],
  },
  {
    properties: { resourceSubtype: { const: "reference" } },
    ...nonEnumSubtypeExclusions,
  },
];

const updateCustomFieldInputSchema = s.object(
  "The input payload for this action.",
  {
    customFieldId: gidField("The custom field gid."),
    ...customFieldMutationFields,
    includeFields: includeFieldsSchema,
  },
  { required: ["customFieldId"] },
);
updateCustomFieldInputSchema.anyOf = Object.keys(customFieldMutationFields).map((field) => ({ required: [field] }));
updateCustomFieldInputSchema.allOf = [
  ...updateNumberFormatDependencies,
  {
    if: { required: ["inputRestrictions"] },
    then: { not: { anyOf: numberOnlyFieldNames.map((field) => ({ required: [field] })) } },
  },
  {
    if: { not: { required: ["format"] } },
    then: {
      not: {
        allOf: [
          {
            required: ["currencyCode"],
            properties: { currencyCode: { not: { type: "null" } } },
          },
          {
            anyOf: [
              {
                required: ["customLabel"],
                properties: { customLabel: { not: { type: "null" } } },
              },
              {
                required: ["customLabelPosition"],
                properties: { customLabelPosition: { not: { type: "null" } } },
              },
            ],
          },
        ],
      },
    },
  },
];

const createEnumOptionInputSchema = s.object(
  "The input payload for this action.",
  {
    customFieldId: gidField("The enum or multi-enum custom field gid."),
    ...enumOptionCreateFields,
    insertBeforeId: gidField("An existing enum option before which to insert the new option."),
    insertAfterId: gidField("An existing enum option after which to insert the new option."),
    includeFields: includeFieldsSchema,
  },
  { required: ["customFieldId", "name"] },
);
createEnumOptionInputSchema.allOf = [{ not: { required: ["insertBeforeId", "insertAfterId"] } }];

const insertEnumOptionInputSchema = s.object(
  "The input payload for this action.",
  {
    customFieldId: gidField("The custom field gid."),
    enumOptionId: gidField("The enum option gid to relocate."),
    beforeEnumOptionId: gidField("An existing enum option before which to place the relocated option."),
    afterEnumOptionId: gidField("An existing enum option after which to place the relocated option."),
    includeFields: includeFieldsSchema,
  },
  { required: ["customFieldId", "enumOptionId"] },
);
insertEnumOptionInputSchema.oneOf = [
  { required: ["beforeEnumOptionId"], not: { required: ["afterEnumOptionId"] } },
  { required: ["afterEnumOptionId"], not: { required: ["beforeEnumOptionId"] } },
];

const updateEnumOptionInputSchema = s.object(
  "The input payload for this action.",
  {
    enumOptionId: gidField("The enum option gid."),
    ...enumOptionUpdateFields,
    includeFields: includeFieldsSchema,
  },
  { required: ["enumOptionId"] },
);
updateEnumOptionInputSchema.anyOf = Object.keys(enumOptionUpdateFields).map((field) => ({ required: [field] }));

const customFieldOutputSchema = s.object("The output payload for this action.", {
  customField: customFieldSchema,
});

const customFieldsOutputSchema = s.object("The output payload for this action.", {
  customFields: s.array("The Asana custom fields.", customFieldSchema),
  nextCursor: nextCursorSchema,
});

const enumOptionOutputSchema = s.object("The output payload for this action.", {
  enumOption: enumOptionSchema,
});

const customFieldSettingsOutputSchema = s.object("The output payload for this action.", {
  customFieldSettings: s.array("The Asana custom field settings.", customFieldSettingSchema),
  nextCursor: nextCursorSchema,
});

const teamCustomFieldSettingsOutputSchema = s.object("The output payload for this action.", {
  customFieldSettings: s.array("The Asana custom field settings.", customFieldSettingSchema),
});

function resourceInput(idField: string, description: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      [idField]: gidField(description),
      includeFields: includeFieldsSchema,
    },
    { required: [idField] },
  );
}

function paginatedResourceInput(idField: string, description: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      [idField]: gidField(description),
      ...paginationFields,
      includeFields: includeFieldsSchema,
    },
    { required: [idField] },
  );
}

export const asanaCustomFieldActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_custom_field",
    description: "Create an Asana custom field in a workspace.",
    requiredScopes: ["custom_fields:write"],
    inputSchema: createCustomFieldInputSchema,
    outputSchema: customFieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_custom_field",
    description: "Get an Asana custom field by gid.",
    requiredScopes: ["custom_fields:read"],
    inputSchema: resourceInput("customFieldId", "The custom field gid."),
    outputSchema: customFieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_custom_field",
    description: "Update an Asana custom field.",
    requiredScopes: ["custom_fields:write"],
    inputSchema: updateCustomFieldInputSchema,
    outputSchema: customFieldOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_custom_field",
    description: "Delete an Asana custom field.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for this action.",
      { customFieldId: gidField("The custom field gid.") },
      { required: ["customFieldId"] },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_workspace_custom_fields",
    description: "List the custom fields in an Asana workspace.",
    requiredScopes: ["custom_fields:read"],
    inputSchema: paginatedResourceInput("workspaceId", "The workspace gid."),
    outputSchema: customFieldsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_custom_field_enum_option",
    description: "Create an option for an Asana enum or multi-enum custom field.",
    requiredScopes: ["custom_fields:write"],
    inputSchema: createEnumOptionInputSchema,
    outputSchema: enumOptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "insert_custom_field_enum_option",
    description: "Reorder an option in an Asana enum or multi-enum custom field.",
    requiredScopes: ["custom_fields:write"],
    inputSchema: insertEnumOptionInputSchema,
    outputSchema: enumOptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_custom_field_enum_option",
    description: "Update an Asana enum option.",
    requiredScopes: ["custom_fields:write"],
    inputSchema: updateEnumOptionInputSchema,
    outputSchema: enumOptionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_project_custom_field_settings",
    description: "List the custom field settings on an Asana project.",
    requiredScopes: ["projects:read"],
    inputSchema: paginatedResourceInput("projectId", "The project gid."),
    outputSchema: customFieldSettingsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_team_custom_field_settings",
    description: "List the custom field settings on an Asana team. Asana returns this collection without pagination.",
    requiredScopes: ["teams:read"],
    inputSchema: resourceInput("teamId", "The team gid."),
    outputSchema: teamCustomFieldSettingsOutputSchema,
  }),
];
