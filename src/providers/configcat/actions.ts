import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "configcat";

const uuidSchema = s.uuid("The ConfigCat UUID identifier.");
const productIdSchema = s.uuid("The ConfigCat Product identifier.");
const configIdSchema = s.uuid("The ConfigCat Config identifier.");
const environmentIdSchema = s.uuid("The ConfigCat Environment identifier.");
const settingIdSchema = s.integer("The ConfigCat Feature Flag or Setting identifier.");

const organizationSchema = s.object("The ConfigCat organization summary.", {
  organizationId: uuidSchema,
  name: s.string("The organization name."),
});

const productSchema = s.object("A normalized ConfigCat Product.", {
  productId: productIdSchema,
  name: s.string("The Product name."),
  description: s.nullableString("The Product description when configured."),
  order: s.integer("The Product order on the ConfigCat Dashboard."),
  reasonRequired: s.boolean("Whether change reasons are required in this Product."),
  approveRequired: s.boolean("Whether changes require approval in this Product."),
  organization: organizationSchema,
  raw: s.looseObject("The raw Product object returned by ConfigCat."),
});

const configSchema = s.object("A normalized ConfigCat Config.", {
  configId: configIdSchema,
  name: s.string("The Config name."),
  description: s.nullableString("The Config description when configured."),
  order: s.integer("The Config order on the ConfigCat Dashboard."),
  productId: productIdSchema,
  productName: s.string("The parent Product name."),
  evaluationVersion: s.nullableString("The Config evaluation version when returned."),
  raw: s.looseObject("The raw Config object returned by ConfigCat."),
});

const environmentSchema = s.object("A normalized ConfigCat Environment.", {
  environmentId: environmentIdSchema,
  name: s.string("The Environment name."),
  color: s.nullableString("The Environment color when configured."),
  description: s.nullableString("The Environment description when configured."),
  order: s.integer("The Environment order on the ConfigCat Dashboard."),
  reasonRequired: s.boolean("Whether change reasons are required in this Environment."),
  approveRequired: s.boolean("Whether changes require approval in this Environment."),
  productId: productIdSchema,
  productName: s.string("The parent Product name."),
  raw: s.looseObject("The raw Environment object returned by ConfigCat."),
});

const settingTypeSchema = s.stringEnum("The ConfigCat Feature Flag or Setting type.", [
  "boolean",
  "string",
  "int",
  "double",
]);

const settingSchema = s.object("A normalized ConfigCat Feature Flag or Setting.", {
  settingId: settingIdSchema,
  key: s.string("The Feature Flag or Setting key."),
  name: s.string("The Feature Flag or Setting name."),
  hint: s.nullableString("The Feature Flag or Setting description when configured."),
  order: s.integer("The Feature Flag or Setting order on the ConfigCat Dashboard."),
  settingType: settingTypeSchema,
  isJson: s.boolean("Whether string values are validated as JSON values."),
  configId: configIdSchema,
  configName: s.string("The parent Config name."),
  createdAt: s.nullable(s.dateTime("The Feature Flag or Setting creation timestamp.")),
  raw: s.looseObject("The raw Feature Flag or Setting object returned by ConfigCat."),
});

const settingValueSchema = s.nullable(
  s.anyOf("The served non-null value returned by ConfigCat.", [
    s.boolean("A boolean Feature Flag value."),
    s.string("A text Setting value."),
    s.number("A numeric Setting value."),
  ]),
);

const settingValueResponseSchema = s.object("A normalized ConfigCat Setting value response.", {
  settingId: settingIdSchema,
  settingKey: s.string("The Feature Flag or Setting key."),
  settingName: s.string("The Feature Flag or Setting name."),
  settingType: settingTypeSchema,
  value: settingValueSchema,
  updatedAt: s.nullable(s.dateTime("The last update timestamp when returned.")),
  lastUpdaterUserEmail: s.nullableString("The email of the last updater when returned."),
  lastUpdaterUserFullName: s.nullableString("The name of the last updater when returned."),
  readOnly: s.boolean("Whether the Setting value is read-only for the current credentials."),
  configId: configIdSchema,
  configName: s.string("The Config name."),
  environmentId: environmentIdSchema,
  environmentName: s.string("The Environment name."),
  raw: s.looseObject("The raw Setting value object returned by ConfigCat."),
});

const configSettingFormulaSchema = s.object("A normalized ConfigCat bulk Setting value item.", {
  settingId: settingIdSchema,
  settingKey: s.string("The Feature Flag or Setting key."),
  settingName: s.string("The Feature Flag or Setting name."),
  settingType: settingTypeSchema,
  defaultValue: s.looseObject("The ConfigCat default value object for this Setting."),
  updatedAt: s.nullable(s.dateTime("The last update timestamp when returned.")),
  lastUpdaterUserEmail: s.nullableString("The email of the last updater when returned."),
  lastUpdaterUserFullName: s.nullableString("The name of the last updater when returned."),
  raw: s.looseObject("The raw bulk Setting value item returned by ConfigCat."),
});

export const configcatActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_me",
    description: "Get the ConfigCat user authenticated by the Public API credentials.",
    inputSchema: s.object("The input payload for getting the authenticated ConfigCat user.", {}),
    outputSchema: s.object("The response returned when getting the authenticated ConfigCat user.", {
      user: s.object("The authenticated ConfigCat user.", {
        email: s.string("The authenticated user's email address."),
        fullName: s.string("The authenticated user's full name."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List ConfigCat Products available to the authenticated Public API credentials.",
    inputSchema: s.object("The input payload for listing ConfigCat Products.", {}),
    outputSchema: s.object("The response returned when listing ConfigCat Products.", {
      products: s.array("The Products returned by ConfigCat.", productSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_configs",
    description: "List ConfigCat Configs in a Product.",
    inputSchema: s.object("The input payload for listing ConfigCat Configs.", {
      productId: productIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ConfigCat Configs.", {
      configs: s.array("The Configs returned by ConfigCat.", configSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_environments",
    description: "List ConfigCat Environments in a Product.",
    inputSchema: s.object("The input payload for listing ConfigCat Environments.", {
      productId: productIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ConfigCat Environments.", {
      environments: s.array("The Environments returned by ConfigCat.", environmentSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_settings",
    description: "List ConfigCat Feature Flags and Settings in a Config.",
    inputSchema: s.object("The input payload for listing ConfigCat Feature Flags and Settings.", {
      configId: configIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ConfigCat Feature Flags and Settings.", {
      settings: s.array("The Feature Flags and Settings returned by ConfigCat.", settingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_setting_value",
    description: "Get a ConfigCat Feature Flag or Setting value for an Environment.",
    inputSchema: s.object("The input payload for getting a ConfigCat Setting value.", {
      environmentId: environmentIdSchema,
      settingId: settingIdSchema,
    }),
    outputSchema: s.object("The response returned when getting a ConfigCat Setting value.", {
      settingValue: settingValueResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_setting_values",
    description: "List ConfigCat Feature Flag and Setting values for a Config and Environment.",
    inputSchema: s.object("The input payload for listing ConfigCat Setting values.", {
      configId: configIdSchema,
      environmentId: environmentIdSchema,
    }),
    outputSchema: s.object("The response returned when listing ConfigCat Setting values.", {
      config: configSchema,
      environment: environmentSchema,
      readOnly: s.boolean("Whether the returned Setting values are read-only."),
      settingValues: s.array("The Setting value descriptors returned by ConfigCat.", configSettingFormulaSchema),
      raw: s.looseObject("The raw bulk Setting values response returned by ConfigCat."),
    }),
  }),
];
